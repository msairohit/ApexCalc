# Polyglot File Creation — Detailed Implementation Logic

This document describes exactly how the app creates, stores, detects, and extracts
polyglot files. All logic lives in [`src/services/polyglot.ts`](src/services/polyglot.ts),
orchestrated by [`src/components/CreatePolyglotModal.tsx`](src/components/CreatePolyglotModal.tsx)
and [`src/services/storage.ts`](src/services/storage.ts).

---

## What Is a Polyglot File?

A **polyglot file** is a single binary file that is simultaneously valid as two
different file formats:

1. **Cover file** — the public face (e.g., a PDF, Java source file, HTML page).
   Any standard reader or viewer opens it and sees exactly the original document.
2. **Hidden payload** — a secret image or video encoded and appended inside the
   cover file in a region that the cover format's parser ignores.

The trick is that every file format has an "end" it cares about. Anything appended
after that end is silently ignored by parsers:

| Cover format | Parsing boundary | What parsers ignore |
|---|---|---|
| PDF | `%%EOF` token | Everything after `%%EOF` |
| JPEG | `FF D9` bytes (End-of-Image marker) | Any bytes after `FF D9` |
| Java/C/JS/CSS | Valid token stream | Block comments `/* … */` |
| Python/Shell | Valid token stream | Line comments `# …` |
| HTML/XML | Valid DOM tree | HTML comments `<!-- … -->` |
| Generic binary | Entire byte stream | Appended data after file body |

---

## Step-by-Step: How a Polyglot Is Created

### User Flow (4 steps in the wizard — `CreatePolyglotModal.tsx`)

```
Step 1  →  User picks a secret photo or video  (expo-image-picker)
Step 2  →  User picks a cover document          (expo-document-picker)
Step 3  →  User names the output file,
           taps "Compile & Save"
Step 4  →  Success confirmation screen
```

### Compile Logic (`handleCompile` in `CreatePolyglotModal.tsx`, lines 112–160)

```typescript
// 1. Read both files from the device filesystem as Base64 strings
const coverBase64  = await FileSystem.readAsStringAsync(coverFile.uri,  { encoding: Base64 });
const hiddenBase64 = await FileSystem.readAsStringAsync(hiddenFile.uri, { encoding: Base64 });

// 2. Call the stitching engine to merge them
const polyglotBase64 = stitchFiles(
  coverBase64,
  hiddenBase64,
  coverFile.name,      // determines which comment syntax to use
  hiddenFile.name,     // stored inside the marker for extraction later
  hiddenFile.mimeType  // stored inside the marker for correct decoding later
);

// 3. Save the output to the app's private vault directory
await savePolyglotFile(activeSpace.id, outputName, polyglotBase64, ...);
```

---

## The Stitching Engine (`stitchFiles` — `polyglot.ts`, lines 92–148)

This is the core algorithm.

### Phase 1 — Decode Cover File to Binary String

```typescript
const coverBinary = base64ToBinary(coverBase64);
```

The cover file's Base64 string is decoded to a raw Latin-1 binary string (one char
per byte). This gives us a JavaScript string that represents the exact bytes of the
cover document.

**`base64ToBinary`** uses the global `atob()` (available in React Native's Hermes
engine and in browsers). A manual fallback implementation exists for environments
where `atob` is unavailable.

### Phase 2 — Build the Marker String

The hidden file is **not** decoded to binary. Its Base64 string is embedded directly
as text inside a structured marker:

```
POLYGLOT_START%<mimeType>%<hiddenFileName>%<hiddenBase64>%POLYGLOT_END
```

Example for a hidden `secret.png`:
```
POLYGLOT_START%image/png%secret.png%iVBORw0KGgoAAAANSUhEUgAA...%POLYGLOT_END
```

The `%` character is used as a delimiter. The payload (Base64) can itself contain
`%` characters, which is handled safely during extraction by splitting only on the
first two `%` occurrences and `join`-ing the rest.

### Phase 3 — Wrap Marker in Cover-Format Comment Syntax

The marker is then wrapped in the appropriate comment syntax for the cover file's
extension, making it syntactically invisible to the cover format's parser:

```typescript
const ext = coverName.split('.').pop()?.toLowerCase();
let suffix = '';

switch (ext) {
  case 'java': case 'js': case 'ts': case 'tsx': case 'jsx':
  case 'cpp':  case 'c':  case 'cs': case 'swift': case 'css':
    suffix = `\n/* POLYGLOT_START%...%POLYGLOT_END */\n`;   // C-style block comment
    break;

  case 'html': case 'xml':
    suffix = `\n<!-- POLYGLOT_START%...%POLYGLOT_END -->\n`; // HTML/XML comment
    break;

  case 'py': case 'sh': case 'rb': case 'pl':
    suffix = `\n# POLYGLOT_START%...%POLYGLOT_END\n`;        // hash comment
    break;

  case 'pdf':
    suffix = `\n%POLYGLOT_START%...%POLYGLOT_END\n`;         // PDF comment (%)
    break;

  default:
    suffix = `\nPOLYGLOT_START%...%POLYGLOT_END\n`;          // raw binary append
    break;
}
```

### Phase 4 — Concatenate and Re-Encode to Base64

```typescript
const mergedBinary = coverBinary + suffix;
return binaryToBase64(mergedBinary);
```

The comment suffix (which is plain ASCII text) is concatenated directly onto the
binary string of the cover file, and the result is re-encoded as Base64.

This Base64 string is the **final polyglot file**. It is what gets saved to disk.

---

## Binary Encoding Details

The app operates entirely in JavaScript strings (Latin-1, one char per byte) because
React Native's Hermes engine and `expo-file-system` use Base64 as the file I/O
boundary. There is no `Buffer` or `Uint8Array` usage — all binary manipulation is
done via `charCodeAt` / `String.fromCharCode` and the standard `atob`/`btoa` globals.

```
Disk file  ──[readAsStringAsync, Base64]──▶  base64 string
                       │
               base64ToBinary(base64)
                       │
                       ▼
              binary string (Latin-1)
              (1 char = 1 byte)
                       │
          + suffix (ASCII comment block)
                       │
               binaryToBase64(binary)
                       │
                       ▼
              new base64 string  ──[writeAsStringAsync, Base64]──▶  Disk file
```

---

## File Storage (`savePolyglotFile` — `storage.ts`, lines 119–161)

Once stitched, the polyglot Base64 is written to the app's **private sandbox**:

```
/data/user/0/<package_name>/files/vault/<spaceId>/<timestamp>_<sanitized_filename>
```

This path is managed by `expo-file-system`'s `documentDirectory`. It is:
- ✅ Persistent across app restarts
- ✅ Not visible in Android's Files app or any other app
- ✅ Not accessible without root
- ✅ Automatically deleted when the app is uninstalled

Alongside the file, metadata (filename, cover name, hidden name, MIME type, size,
timestamp) is saved to a JSON file at:

```
/data/user/0/<package_name>/files/vault_metadata.json
```

The vault passwords and space configs are stored separately in
**`expo-secure-store`** (Android Keystore-backed encrypted storage).

---

## How Extraction Works (`extractHidden` — `polyglot.ts`, lines 153–230)

When the user taps "Reveal Hidden Content", the process is reversed:

### Step 1 — Decode Entire File to Binary

```typescript
const binary = base64ToBinary(polyglotBase64);
```

### Step 2 — Locate the Marker

```typescript
const startIndex = binary.indexOf('POLYGLOT_START%');
```

If `startIndex === -1`, the file has no hidden payload → `hasHidden: false`.

### Step 3 — Walk Backward to Find Comment Wrapper Start

To reconstruct a clean cover file (without any marker noise), the engine looks at the
10 bytes immediately before `POLYGLOT_START%` to detect which comment wrapper is present:

```typescript
const beforeStart = binary.substring(startIndex - 10, startIndex);

if (beforeStart.includes('/* '))   → commentStartIndex = lastIndexOf('/*', startIndex)
if (beforeStart.includes('<!-- ')) → commentStartIndex = lastIndexOf('<!--', startIndex)
if (beforeStart.includes('# '))    → commentStartIndex = lastIndexOf('#', startIndex)
if (beforeStart.includes('%'))     → commentStartIndex = lastIndexOf('%', startIndex)
else                               → commentStartIndex = startIndex - 1 (newline trim)
```

```typescript
cleanCoverBinary = binary.substring(0, commentStartIndex);
```

### Step 4 — Extract the Payload

```typescript
const dataStart = startIndex + 'POLYGLOT_START%'.length;
const endIndex  = binary.indexOf('%POLYGLOT_END', dataStart);

const payload = binary.substring(dataStart, endIndex);
const parts   = payload.split('%');
// parts[0] = mimeType  (e.g. "image/png")
// parts[1] = filename  (e.g. "secret.png")
// parts.slice(2).join('%') = full Base64 of the hidden file
```

Using `parts.slice(2).join('%')` safely handles any `%` characters that appear
inside the Base64 payload itself.

### Step 5 — Return Both Files

```typescript
return {
  hasHidden:   true,
  coverBase64: binaryToBase64(cleanCoverBinary),  // original document, no marker
  hiddenData: {
    name:     parts[1],
    mimeType: parts[0],
    base64:   parts.slice(2).join('%'),            // ready to render or write to disk
  },
};
```

The `hiddenData.base64` is then rendered directly as a `data:image/...;base64,...`
URI for images, or written to a temporary cache file and handed to `expo-video` for
video playback.

---

## Importing an Existing Polyglot File

The app also supports importing a polyglot file that was created earlier (or on
another device). In the advanced vault, tapping **"Import File"** opens the document
picker for any file type. The import handler (`handleAdvancedImport` in
`[spaceId].tsx`) calls `extractHidden()` on the imported file:

- If `hasHidden === true` → treat it as a polyglot and save it with the extracted
  metadata (hidden name and MIME type).
- If `hasHidden === false` and the file is an image or video → save it directly
  (no hidden layer).
- Otherwise → reject with a user-facing error.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CREATE POLYGLOT                              │
│                                                                     │
│  [Image/Video]          [PDF/Java/HTML/etc]                        │
│   hiddenFile  ──────────── coverFile                               │
│       │                       │                                     │
│  readAsStringAsync        readAsStringAsync                         │
│  (Base64)                 (Base64)                                  │
│       │                       │                                     │
│       └──────────┬────────────┘                                     │
│                  ▼                                                  │
│           stitchFiles()                                             │
│         ┌────────────────┐                                          │
│         │ 1. base64→bin  │  decode cover to binary string           │
│         │ 2. build marker│  POLYGLOT_START%mime%name%b64%END        │
│         │ 3. wrap comment│  /* marker */ or <!-- --> or # or %     │
│         │ 4. concatenate │  coverBinary + suffix                    │
│         │ 5. bin→base64  │  encode merged binary back to Base64     │
│         └────────────────┘                                          │
│                  │                                                  │
│           polyglotBase64                                            │
│                  │                                                  │
│         savePolyglotFile()                                          │
│                  │                                                  │
│    ┌─────────────▼───────────────┐                                  │
│    │  documentDirectory/vault/   │                                  │
│    │  <spaceId>/<ts>_output.pdf  │  ← not visible to user           │
│    └─────────────────────────────┘                                  │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        REVEAL HIDDEN                                │
│                                                                     │
│  vault file (Base64)                                                │
│       │                                                             │
│  extractHidden()                                                    │
│  ┌─────────────────────┐                                            │
│  │ 1. base64→bin       │  decode full polyglot to binary            │
│  │ 2. find marker      │  indexOf('POLYGLOT_START%')                │
│  │ 3. walk backward    │  strip comment wrapper → cleanCoverBinary  │
│  │ 4. slice payload    │  between POLYGLOT_START% and %POLYGLOT_END │
│  │ 5. split('%', 3)    │  → mimeType, name, base64                  │
│  │ 6. binaryToBase64   │  re-encode clean cover                     │
│  └─────────────────────┘                                            │
│       │                                                             │
│  ┌────┴──────────────────────┐                                      │
│  │ coverBase64               │  → view cover mode (PDF, code, etc.) │
│  │ hiddenData.base64 + mime  │  → render image or write temp video  │
│  └───────────────────────────┘                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Constraints and Limitations

| Constraint | Detail |
|---|---|
| **No encryption** | The hidden payload is only obscured (Base64 inside a comment), not encrypted. Anyone who knows the marker strings could extract it manually. |
| **File size grows** | The polyglot is roughly `coverSize + (hiddenSize × 1.37)` because Base64 adds ~33% overhead. |
| **PDF readers vary** | Most standard PDF readers (Adobe, browser built-in) ignore data after `%%EOF`. Some strict validators may flag the extra bytes. |
| **Compilers still work** | Java, JS, Python files with the appended comment compile and run without errors because the marker is syntactically valid comment syntax. |
| **No chunking** | Very large hidden files (>50 MB) may cause memory pressure on Android because the entire file is loaded into a JS string. |
