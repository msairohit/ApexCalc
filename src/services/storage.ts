import * as FileSystem from 'expo-file-system/legacy';
import { documentDirectory, EncodingType } from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as Sharing from 'expo-sharing';
import { extractHidden } from './polyglot';
/**
 * Extract and share the hidden file from a polyglot file.
 */
export async function shareHiddenFile(filePath: string, hiddenName: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  // Read polyglot file as base64
  const polyglotBase64 = await FileSystem.readAsStringAsync(filePath, { encoding: EncodingType.Base64 });
  const result = extractHidden(polyglotBase64);
  if (!result.hasHidden || !result.hiddenData) {
    throw new Error('No hidden content found in this file.');
  }

  // Write hidden file to temp location
  const tempUri = `${FileSystem.cacheDirectory || ''}shared_hidden_${Date.now()}_${hiddenName}`;
  await FileSystem.writeAsStringAsync(tempUri, result.hiddenData.base64, { encoding: EncodingType.Base64 });

  await Sharing.shareAsync(tempUri, {
    dialogTitle: `Share ${hiddenName}`,
  });

  // Optionally, clean up temp file after sharing (not strictly necessary)
  // await FileSystem.deleteAsync(tempUri, { idempotent: true });
}

export interface VaultSpace {
  id: string;
  name: string;
  passwordFormula: string;
  themeId: string;
  mode: 'simple' | 'advanced'; // simple = clean file-only vault; advanced = full polyglot features
}

export interface FileMetadata {
  id: string;
  fileName: string;
  filePath: string;
  coverName: string;
  hiddenName: string;
  hiddenMime: string;
  fileSize: number;
  timestamp: number;
}

const SECURE_STORE_SPACES_KEY = 'vault_spaces_config';
const METADATA_FILE_PATH = (documentDirectory || '') + 'vault_metadata.json';

// Default spaces if none exist
const DEFAULT_SPACES: VaultSpace[] = [
  {
    id: 'space_a',
    name: 'My Vault',
    passwordFormula: '99+99',
    themeId: 'cyberNeon',
    mode: 'simple',
  },
  {
    id: 'space_b',
    name: 'Secondary Vault',
    passwordFormula: '7*7',
    themeId: 'glassObsidian',
    mode: 'advanced',
  },
];

/**
 * Initialize storage system by ensuring vault directories exist.
 */
async function ensureDirectoryExists(dirPath: string) {
  const dirInfo = await FileSystem.getInfoAsync(dirPath);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  }
}

/**
 * Get all vault spaces and their passwords.
 */
export async function getVaultSpaces(): Promise<VaultSpace[]> {
  try {
    const data = await SecureStore.getItemAsync(SECURE_STORE_SPACES_KEY);
    if (data) {
      const parsed: VaultSpace[] = JSON.parse(data);
      // Back-fill mode for spaces saved before this field existed
      return parsed.map((s, i) => ({
        ...s,
        mode: s.mode ?? (i === 0 ? 'simple' : 'advanced'),
      }));
    }
  } catch (error) {
    console.error('Error reading vault spaces:', error);
  }
  // Initialize with defaults if empty
  await saveVaultSpaces(DEFAULT_SPACES);
  return DEFAULT_SPACES;
}

/**
 * Save vault spaces list to SecureStore.
 */
export async function saveVaultSpaces(spaces: VaultSpace[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_STORE_SPACES_KEY, JSON.stringify(spaces));
  } catch (error) {
    console.error('Error saving vault spaces:', error);
  }
}

/**
 * Read all file metadata from the JSON file on disk.
 */
async function readAllMetadata(): Promise<Record<string, FileMetadata[]>> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(METADATA_FILE_PATH);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(METADATA_FILE_PATH);
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading metadata file:', error);
  }
  return {};
}

/**
 * Write all file metadata to the JSON file on disk.
 */
async function writeAllMetadata(metadata: Record<string, FileMetadata[]>): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(METADATA_FILE_PATH, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error writing metadata file:', error);
  }
}

/**
 * Get files list for a specific vault space.
 */
export async function getFilesForSpace(spaceId: string): Promise<FileMetadata[]> {
  const allMeta = await readAllMetadata();
  return allMeta[spaceId] || [];
}

/**
 * Save a new polyglot file to a space.
 */
export async function savePolyglotFile(
  spaceId: string,
  fileName: string,
  fileBase64: string,
  coverName: string,
  hiddenName: string,
  hiddenMime: string,
  fileSize: number
): Promise<FileMetadata> {
  const spaceDir = `${documentDirectory}vault/${spaceId}/`;
  await ensureDirectoryExists(spaceDir);

  const fileId = `${Date.now()}`;
  // Sanitize file name
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `${spaceDir}${fileId}_${sanitizedName}`;

  // Write physical file to storage
  await FileSystem.writeAsStringAsync(filePath, fileBase64, {
    encoding: EncodingType.Base64,
  });

  const fileMeta: FileMetadata = {
    id: fileId,
    fileName: sanitizedName,
    filePath,
    coverName,
    hiddenName,
    hiddenMime,
    fileSize,
    timestamp: Date.now(),
  };

  // Update metadata registry
  const allMeta = await readAllMetadata();
  if (!allMeta[spaceId]) {
    allMeta[spaceId] = [];
  }
  allMeta[spaceId].push(fileMeta);
  await writeAllMetadata(allMeta);

  return fileMeta;
}

/**
 * Read the file base64 content from disk.
 */
export async function readFileContent(filePath: string): Promise<string> {
  return await FileSystem.readAsStringAsync(filePath, {
    encoding: EncodingType.Base64,
  });
}

/**
 * Delete a file from a space.
 */
export async function deleteFileFromSpace(spaceId: string, fileId: string): Promise<void> {
  const allMeta = await readAllMetadata();
  const spaceFiles = allMeta[spaceId] || [];
  const fileIndex = spaceFiles.findIndex(f => f.id === fileId);

  if (fileIndex !== -1) {
    const file = spaceFiles[fileIndex];
    try {
      // Remove physical file
      await FileSystem.deleteAsync(file.filePath, { idempotent: true });
    } catch (e) {
      console.warn('Physical file deletion failed or file did not exist:', e);
    }

    // Remove metadata
    spaceFiles.splice(fileIndex, 1);
    allMeta[spaceId] = spaceFiles;
    await writeAllMetadata(allMeta);
  }
}

/**
 * Export/Share a file using the Native Android Share Sheet.
 */
export async function shareFile(filePath: string, fileName: string): Promise<void> {
  const isAvailable = await Sharing.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sharing is not available on this device');
  }

  await Sharing.shareAsync(filePath, {
    dialogTitle: `Export ${fileName}`,
  });
}

/**
 * Import a polyglot file from outside the app.
 * Takes the temporary URI from the document picker, reads it, processes it,
 * and saves it into the target space.
 */
export async function importExternalPolyglot(
  spaceId: string,
  externalUri: string,
  fileName: string,
  extractor: (base64: string) => { hasHidden: boolean; hiddenData?: { name: string; mimeType: string } }
): Promise<{ success: boolean; error?: string; fileMetadata?: FileMetadata }> {
  try {
    // Read external file content
    const base64Content = await FileSystem.readAsStringAsync(externalUri, {
      encoding: EncodingType.Base64,
    });

    // Check if it's a polyglot
    const result = extractor(base64Content);
    if (!result.hasHidden || !result.hiddenData) {
      return {
        success: false,
        error: 'This file does not contain a hidden polyglot payload.',
      };
    }

    // Get size
    const fileInfo = await FileSystem.getInfoAsync(externalUri);
    const fileSize = fileInfo.exists ? fileInfo.size : base64Content.length * 0.75;

    // Save into space
    const meta = await savePolyglotFile(
      spaceId,
      fileName,
      base64Content,
      fileName, // cover name
      result.hiddenData.name, // hidden file name
      result.hiddenData.mimeType, // hidden file mime
      fileSize
    );

    return {
      success: true,
      fileMetadata: meta,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to import file',
    };
  }
}
