# Implementation Plan - Calculator Vault & Polyglot File Masking App

This project is a multi-platform (Android & Web) Expo React Native application designed as a "Calculator Vault." The app functions as a normal calculator on the surface, but entering specific equations followed by the `=` sign opens hidden spaces. Each hidden space can hold and extract "polyglot files"—files that appear to be standard documents (like PDFs, Java code, HTML, or images) but contain hidden image or video payloads.

---

## User Review Required

> [!IMPORTANT]
> **Polyglot Technique Implementation**
> To ensure compatibility across both Web (browser) and Native (Android) platforms, we will use a **Marker-Based Concatenation** technique:
> - **PDFs**: We append `%POLYGLOT_START%<mime>%<base64>%POLYGLOT_END` at the end. Standard PDF readers treat this as a comment and render the PDF normally.
> - **Java/C++/JS Code**: We append `/* POLYGLOT_START%<mime>%<base64>%POLYGLOT_END */` at the end. The compilers/interpreters treat it as a comment, and it remains compilable.
> - **HTML**: We append `<!-- POLYGLOT_START%<mime>%<base64>%POLYGLOT_END -->`.
> - **Images (JPEG/PNG/GIF)**: We append `POLYGLOT_START%<mime>%<base64>%POLYGLOT_END` after the standard End-Of-Image marker (e.g., `FF D9` for JPEG). Image viewers ignore any data trailing the end marker.
> - **Default Binary**: We append the marker at the end of the file.
>
> Please confirm if this approach meets your requirements, or if you prefer a different byte-level interleaving.

> [!TIP]
> **Design Theme & Customization**
> We plan to build a high-end, premium UI with the following aesthetics:
> - **Theme**: Sleek dark mode featuring a glowing cyber-punk or glassmorphism aesthetic.
> - **Calculator**: Glassmorphic buttons with linear gradients (neon purple/blue/orange accents), haptic-like press micro-animations, and a beautiful glowing LCD-style formula display.
> - **Vault Space**: Dashboard with clean layouts, file type cards, interactive file-viewer modal, and step-by-step wizard for creating polyglot files.
> - **Layout Options**: Interactive theme selector in Settings to switch between "Cyber Neon", "Glass Obsidian", and "Minimal Stealth" themes.

---

## Open Questions

1. **Default Vault Passwords**:
   We will initialize the app with two default passwords for testing/first run:
   - Space A: `12345=` (or equation like `99+99=`)
   - Space B: `54321=` (or equation like `7*7=`)
   Do you have specific default formulas or passwords you would like us to configure?
   *(Note: Users can customize these passwords inside the Vault Settings screen.)*

2. **File Persistence**:
   - On **Android**: Files are stored in the app's secure documents directory (`expo-file-system`).
   - On **Web**: Since web storage is temporary and bounded by browser limits, we will save file metadata in IndexedDB and allow the user to immediately download the generated polyglot file to their desktop/downloads folder.
   Does this storage model align with your intended multi-platform usage?

---

## Proposed Changes

We will create an Expo project configured with TypeScript, Expo Router, and Web support.

```
/
├── app/                           # Expo Router Screens
│   ├── _layout.tsx               # Main entry, provider setup, global navigation
│   ├── index.tsx                 # Calculator Screen (Default entry point)
│   ├── vault/
│   │   ├── [spaceId].tsx          # Vault Space view (files grid, uploads, viewer)
│   │   └── settings.tsx           # Passwords & space management
├── components/                    # UI Components
│   ├── CalculatorButton.tsx      # Premium animated calculator button
│   ├── GlassCard.tsx             # Glassmorphic container wrapper
│   ├── FileCard.tsx              # Component showing file details & actions
│   ├── FileViewerModal.tsx       # Secure image/video viewer modal
│   └── CreatePolyglotModal.tsx   # Step-by-step wizard to create polyglot files
├── services/                      # Logical Services
│   ├── storage.ts                # Unified file & metadata storage (Native + Web)
│   ├── polyglot.ts               # Encoding/Decoding & stitching logic
│   └── theme.ts                  # Theme configurations (gradients, colors, shadows)
├── package.json                   # Project configuration
└── tsconfig.json                  # TypeScript configuration
```

---

### Logical Core Services

#### 1. Polyglot Engine (`services/polyglot.ts`)
This service handles merging the cover file and hidden file, as well as detecting and extracting the hidden file from a loaded polyglot file.

```typescript
export interface FileData {
  name: string;
  base64: string;
  mimeType: string;
}

export interface PolyglotResult {
  fileName: string;
  fileBase64: string;
  mimeType: string;
  hasHidden: boolean;
  hiddenData?: FileData;
}
```

Key algorithms:
- **Stitching**: Based on the extension of the cover file, wrap the base64-encoded hidden file in the appropriate comment structure (`/* ... */`, `% ...`, `<!-- ... -->`, or raw append) and append it to the cover file.
- **Parsing**: Scan the file content for `POLYGLOT_START%<mime>%<base64>%POLYGLOT_END` markers, decode the base64, and reconstruct the hidden file.

#### 2. Storage Adapter (`services/storage.ts`)
Ensures files and metadata persist correctly on both Web and Mobile.
- **Web**: Uses `localforage` or native `IndexedDB` for high-capacity binary storage.
- **Mobile**: Uses `expo-file-system` to save files locally and `expo-secure-store` to keep passwords encrypted.

---

### UI Components & Screens

#### 1. Calculator Screen (`app/index.tsx`)
A sleek calculator with fully working arithmetic.
- Keypad includes: `0-9`, `.`, `+`, `-`, `*`, `/`, `C`, `DEL`, and `=`.
- A hidden gesture or input sequence (e.g. entering a password formula and hitting `=`) triggers a transition.
- **Logic**:
  ```typescript
  const handlePressEqual = () => {
    const matchedSpace = vaultSpaces.find(space => space.password === currentFormula);
    if (matchedSpace) {
      // Clear formula and transition to vault
      router.push(`/vault/${matchedSpace.id}`);
    } else {
      // Evaluate standard arithmetic
      calculateResult();
    }
  }
  ```

#### 2. Vault Space (`app/vault/[spaceId].tsx`)
A premium secure workspace.
- **Grid Layout**: Displays existing files in the current space.
- **File Preview**: Clicking a file reveals its cover page. If it is a polyglot, a button appears to "Reveal Hidden Content".
- **Download/Export**: Allows downloading the polyglot file to the device.
- **Create Polyglot Wizard**: Form where the user uploads/picks a cover file and a hidden image/video, previews both, and compiles them.

---

## Verification Plan

### Automated Tests
- Write Jest test suites for `services/polyglot.ts` to verify stitching and extraction for multiple cover file types (PDF, Java, HTML, Images).
- Verify base64 conversion speed and buffer safety.

### Manual Verification
- **Web App**:
  - Run `npm run dev` and test in Chrome/Firefox.
  - Verify standard calculator functionality.
  - Enter the code `99+99=` to log into Space 1.
  - Upload a PDF cover and a PNG image, export the resulting `.pdf` file.
  - Open the exported `.pdf` in a browser/Adobe Reader to verify it reads perfectly.
  - Re-upload that exact `.pdf` to the vault and verify the PNG is successfully extracted.
- **Android App**:
  - Build the Android apk using Expo Prebuild/EAS or run on emulator.
  - Confirm file picking works seamlessly for image picker and document picker.
  - Verify file storage is persistent after closing and reopening the app.
