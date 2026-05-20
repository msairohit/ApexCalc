export interface FileData {
  name: string;
  base64: string;
  mimeType: string;
}

export interface ExtractResult {
  hasHidden: boolean;
  coverBase64: string;
  hiddenData?: FileData;
}

// Convert a base64 string to a Latin-1 binary string
export function base64ToBinary(base64: string): string {
  // Support React Native and Web global atob
  if (typeof atob === 'function') {
    return atob(base64);
  }
  // Fallback (should not be needed in modern Hermes/browser)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }
  let bufferLength = base64.length * 0.75;
  if (base64[base64.length - 1] === '=') {
    bufferLength--;
    if (base64[base64.length - 2] === '=') {
      bufferLength--;
    }
  }
  let p = 0;
  let binary = '';
  for (let i = 0; i < base64.length; i += 4) {
    const encoded1 = lookup[base64.charCodeAt(i)];
    const encoded2 = lookup[base64.charCodeAt(i + 1)];
    const encoded3 = lookup[base64.charCodeAt(i + 2)];
    const encoded4 = lookup[base64.charCodeAt(i + 3)];
    const bytes = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
    binary += String.fromCharCode((bytes >> 16) & 255);
    if (binary.length < bufferLength) {
      binary += String.fromCharCode((bytes >> 8) & 255);
    }
    if (binary.length < bufferLength) {
      binary += String.fromCharCode(bytes & 255);
    }
  }
  return binary;
}

// Convert a Latin-1 binary string to a base64 string
export function binaryToBase64(binary: string): string {
  if (typeof btoa === 'function') {
    return btoa(binary);
  }
  // Fallback
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let base64 = '';
  let i = 0;
  const len = binary.length;
  for (i = 0; i < len - 2; i += 3) {
    const b1 = binary.charCodeAt(i);
    const b2 = binary.charCodeAt(i + 1);
    const b3 = binary.charCodeAt(i + 2);
    const combined = (b1 << 16) | (b2 << 8) | b3;
    base64 += chars[(combined >> 18) & 63];
    base64 += chars[(combined >> 12) & 63];
    base64 += chars[(combined >> 6) & 63];
    base64 += chars[combined & 63];
  }
  if (i < len) {
    const b1 = binary.charCodeAt(i);
    const b2 = i + 1 < len ? binary.charCodeAt(i + 1) : 0;
    const combined = (b1 << 16) | (b2 << 8);
    base64 += chars[(combined >> 18) & 63];
    base64 += chars[(combined >> 12) & 63];
    if (i + 1 < len) {
      base64 += chars[(combined >> 6) & 63];
    } else {
      base64 += '=';
    }
    base64 += '=';
  }
  return base64;
}

/**
 * Stitch the hidden file data inside the cover file.
 * We append the hidden file base64 wrapped in specific comment tags or directly,
 * depending on the cover file's extension.
 */
export function stitchFiles(
  coverBase64: string,
  hiddenBase64: string,
  coverName: string,
  hiddenName: string,
  hiddenMimeType: string
): string {
  const coverBinary = base64ToBinary(coverBase64);
  const ext = coverName.split('.').pop()?.toLowerCase() || '';

  // Standard markers
  const startMarker = `POLYGLOT_START%${hiddenMimeType}%${hiddenName}%${hiddenBase64}%POLYGLOT_END`;

  let suffix = '';
  switch (ext) {
    case 'java':
    case 'js':
    case 'ts':
    case 'tsx':
    case 'jsx':
    case 'cpp':
    case 'c':
    case 'cs':
    case 'swift':
    case 'css':
      // C-style block comments
      suffix = `\n/* ${startMarker} */\n`;
      break;

    case 'html':
    case 'xml':
      // HTML comment style
      suffix = `\n<!-- ${startMarker} -->\n`;
      break;

    case 'py':
    case 'sh':
    case 'rb':
    case 'pl':
      // Script comments (hash)
      suffix = `\n# ${startMarker}\n`;
      break;

    case 'pdf':
      // PDF comments start with %
      suffix = `\n%${startMarker}\n`;
      break;

    default:
      // Binary append or default fallback
      suffix = `\n${startMarker}\n`;
      break;
  }

  const mergedBinary = coverBinary + suffix;
  return binaryToBase64(mergedBinary);
}

/**
 * Detects and extracts the hidden file and the clean cover file.
 */
export function extractHidden(polyglotBase64: string): ExtractResult {
  const binary = base64ToBinary(polyglotBase64);

  const startTag = 'POLYGLOT_START%';
  const endTag = '%POLYGLOT_END';

  const startIndex = binary.indexOf(startTag);
  if (startIndex === -1) {
    return {
      hasHidden: false,
      coverBase64: polyglotBase64,
    };
  }

  // Find the start index of the comment wrapper to clean the cover file
  // Check if there is comment syntax preceding the start tag
  let cleanCoverBinary = binary;
  let commentStartIndex = startIndex;

  // Search backward from startIndex to find comment start characters if any
  const beforeStart = binary.substring(Math.max(0, startIndex - 10), startIndex);
  if (beforeStart.includes('/* ')) {
    commentStartIndex = binary.lastIndexOf('/*', startIndex);
  } else if (beforeStart.includes('<!-- ')) {
    commentStartIndex = binary.lastIndexOf('<!--', startIndex);
  } else if (beforeStart.includes('# ')) {
    commentStartIndex = binary.lastIndexOf('#', startIndex);
  } else if (beforeStart.includes('%')) {
    commentStartIndex = binary.lastIndexOf('%', startIndex);
  } else if (binary.charCodeAt(startIndex - 1) === 10 || binary.charCodeAt(startIndex - 1) === 13) {
    // Newline just before start
    commentStartIndex = startIndex - 1;
    if (binary.charCodeAt(startIndex - 2) === 13) {
      commentStartIndex = startIndex - 2;
    }
  }

  if (commentStartIndex !== -1) {
    cleanCoverBinary = binary.substring(0, commentStartIndex);
  } else {
    cleanCoverBinary = binary.substring(0, startIndex);
  }

  // Extract the payload
  const dataStart = startIndex + startTag.length;
  const endIndex = binary.indexOf(endTag, dataStart);

  if (endIndex === -1) {
    return {
      hasHidden: false,
      coverBase64: polyglotBase64,
    };
  }

  const payload = binary.substring(dataStart, endIndex);
  const parts = payload.split('%');

  if (parts.length < 3) {
    return {
      hasHidden: false,
      coverBase64: binaryToBase64(cleanCoverBinary),
    };
  }

  const mimeType = parts[0];
  const name = parts[1];
  const base64 = parts.slice(2).join('%');

  return {
    hasHidden: true,
    coverBase64: binaryToBase64(cleanCoverBinary),
    hiddenData: {
      name,
      mimeType,
      base64,
    },
  };
}
