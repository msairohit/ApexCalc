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
const SPACES_FILE_PATH = (documentDirectory || '') + 'vault_spaces.json';
const SETTINGS_FILE_PATH = (documentDirectory || '') + 'vault_settings.json';

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
  {
    id: 'space_c',
    name: 'Work Vault',
    passwordFormula: '123+123',
    themeId: 'emeraldHaze',
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
    const fileInfo = await FileSystem.getInfoAsync(SPACES_FILE_PATH);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(SPACES_FILE_PATH);
      const parsed: VaultSpace[] = JSON.parse(content);
      return parsed.map((s, i) => ({
        ...s,
        mode: s.mode ?? (i === 0 ? 'simple' : 'advanced'),
      }));
    }
  } catch (error) {
    console.error('Error reading vault spaces file:', error);
  }

  // Attempt migration from SecureStore
  try {
    const secureData = await SecureStore.getItemAsync(SECURE_STORE_SPACES_KEY);
    if (secureData) {
      const parsed: VaultSpace[] = JSON.parse(secureData);
      const spaces = parsed.map((s, i) => ({
        ...s,
        mode: s.mode ?? (i === 0 ? 'simple' : 'advanced'),
      }));
      await saveVaultSpaces(spaces);
      return spaces;
    }
  } catch (secureError) {
    console.warn('SecureStore migration failed or empty:', secureError);
  }

  // Fallback to defaults
  await saveVaultSpaces(DEFAULT_SPACES);
  return DEFAULT_SPACES;
}

/**
 * Save vault spaces list to FileSystem.
 */
export async function saveVaultSpaces(spaces: VaultSpace[]): Promise<void> {
  try {
    await FileSystem.writeAsStringAsync(SPACES_FILE_PATH, JSON.stringify(spaces, null, 2));
  } catch (error) {
    console.error('Error saving vault spaces to file:', error);
  }
}

/**
 * Get calculator theme setting.
 */
export async function getCalculatorTheme(): Promise<string> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(SETTINGS_FILE_PATH);
    if (fileInfo.exists) {
      const content = await FileSystem.readAsStringAsync(SETTINGS_FILE_PATH);
      const parsed = JSON.parse(content);
      if (parsed && parsed.calculatorThemeId) {
        return parsed.calculatorThemeId;
      }
    }
  } catch (error) {
    console.error('Error reading settings file:', error);
  }
  return 'cyberNeon';
}

/**
 * Save calculator theme setting.
 */
export async function saveCalculatorTheme(themeId: string): Promise<void> {
  try {
    const config = { calculatorThemeId: themeId };
    await FileSystem.writeAsStringAsync(SETTINGS_FILE_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving settings file:', error);
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
      const parsed: Record<string, FileMetadata[]> = JSON.parse(content);
      
      // Normalize absolute paths dynamically to support dynamic iOS directories and restored backup paths
      for (const spaceId of Object.keys(parsed)) {
        if (Array.isArray(parsed[spaceId])) {
          parsed[spaceId] = parsed[spaceId].map((file) => {
            const fileNameOnly = file.filePath.split('/').pop() || `${file.id}_${file.fileName}`;
            const correctedPath = `${documentDirectory}vault/${spaceId}/${fileNameOnly}`;
            return {
              ...file,
              filePath: correctedPath,
            };
          });
        }
      }
      return parsed;
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

export interface BackupData {
  version: number;
  spaces: VaultSpace[];
  metadata: Record<string, FileMetadata[]>;
  files: {
    spaceId: string;
    fileId: string;
    fileName: string;
    base64: string;
  }[];
}

/**
 * Creates a packed backup file (.json) in the cache directory.
 * Returns the path to the backup file.
 */
export async function createBackupFile(): Promise<string> {
  const spaces = await getVaultSpaces();
  const metadata = await readAllMetadata();

  const files: BackupData['files'] = [];

  for (const spaceId of Object.keys(metadata)) {
    const spaceFiles = metadata[spaceId] || [];
    for (const fileMeta of spaceFiles) {
      try {
        const fileInfo = await FileSystem.getInfoAsync(fileMeta.filePath);
        if (fileInfo.exists) {
          const base64 = await FileSystem.readAsStringAsync(fileMeta.filePath, {
            encoding: EncodingType.Base64,
          });
          files.push({
            spaceId,
            fileId: fileMeta.id,
            fileName: fileMeta.fileName,
            base64,
          });
        } else {
          console.warn(`File not found on disk during backup: ${fileMeta.filePath}`);
        }
      } catch (err) {
        console.error(`Failed to read file ${fileMeta.filePath} for backup:`, err);
      }
    }
  }

  const backupObj: BackupData = {
    version: 1,
    spaces,
    metadata,
    files,
  };

  const backupJson = JSON.stringify(backupObj);
  const backupPath = `${FileSystem.cacheDirectory || ''}polyglot_backup_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(backupPath, backupJson, {
    encoding: EncodingType.UTF8,
  });

  return backupPath;
}

/**
 * Restores vault data from a backup object using the selected strategy.
 */
export async function restoreBackup(
  backupObj: BackupData,
  strategy: 'merge' | 'replace'
): Promise<void> {
  if (strategy === 'replace') {
    // 1. Wipe all current physical files
    try {
      const vaultDir = `${documentDirectory}vault/`;
      const vaultDirInfo = await FileSystem.getInfoAsync(vaultDir);
      if (vaultDirInfo.exists) {
        await FileSystem.deleteAsync(vaultDir, { idempotent: true });
      }
    } catch (e) {
      console.warn('Failed to clear vault directory during replace restore:', e);
    }

    // 2. Clear metadata on disk
    try {
      const metaInfo = await FileSystem.getInfoAsync(METADATA_FILE_PATH);
      if (metaInfo.exists) {
        await FileSystem.deleteAsync(METADATA_FILE_PATH, { idempotent: true });
      }
    } catch (e) {
      console.warn('Failed to clear metadata file during replace restore:', e);
    }

    // 3. Save restored spaces
    await saveVaultSpaces(backupObj.spaces);

    // 4. Restore files & build metadata
    const restoredMetadata: Record<string, FileMetadata[]> = {};
    for (const fileData of backupObj.files) {
      const spaceDir = `${documentDirectory}vault/${fileData.spaceId}/`;
      await ensureDirectoryExists(spaceDir);

      const filePath = `${spaceDir}${fileData.fileId}_${fileData.fileName}`;
      await FileSystem.writeAsStringAsync(filePath, fileData.base64, {
        encoding: EncodingType.Base64,
      });

      const originalMeta = backupObj.metadata[fileData.spaceId]?.find(f => f.id === fileData.fileId);
      if (originalMeta) {
        const restoredMeta: FileMetadata = {
          ...originalMeta,
          filePath,
        };
        if (!restoredMetadata[fileData.spaceId]) {
          restoredMetadata[fileData.spaceId] = [];
        }
        restoredMetadata[fileData.spaceId].push(restoredMeta);
      }
    }

    await writeAllMetadata(restoredMetadata);
  } else {
    // Merge strategy
    const currentSpaces = await getVaultSpaces();
    const currentMetadata = await readAllMetadata();

    const updatedSpaces = [...currentSpaces];
    const updatedMetadata = { ...currentMetadata };

    // Map backup space ID -> target space ID in current app
    const spaceIdMap: Record<string, string> = {};

    for (const restoredSpace of backupObj.spaces) {
      const cleanRestoredFormula = restoredSpace.passwordFormula.trim().replace(/\s+/g, '');
      const existingSpaceWithFormula = currentSpaces.find(
        s => s.passwordFormula.trim().replace(/\s+/g, '') === cleanRestoredFormula
      );

      if (existingSpaceWithFormula) {
        // Merge files into this existing space
        spaceIdMap[restoredSpace.id] = existingSpaceWithFormula.id;
      } else {
        // No password formula conflict. Does the ID conflict?
        const existingSpaceWithId = currentSpaces.find(s => s.id === restoredSpace.id);
        if (existingSpaceWithId) {
          // ID conflicts but formula is different. Assign a new ID
          const newId = `space_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
          const newSpace: VaultSpace = {
            ...restoredSpace,
            id: newId,
          };
          updatedSpaces.push(newSpace);
          spaceIdMap[restoredSpace.id] = newId;
        } else {
          // No conflict at all. Add directly
          updatedSpaces.push(restoredSpace);
          spaceIdMap[restoredSpace.id] = restoredSpace.id;
        }
      }
    }

    // Now restore files and merge metadata
    for (const fileData of backupObj.files) {
      const targetSpaceId = spaceIdMap[fileData.spaceId];
      if (!targetSpaceId) continue;

      const targetFiles = updatedMetadata[targetSpaceId] || [];
      const fileIdExists = targetFiles.some(f => f.id === fileData.fileId);
      if (fileIdExists) {
        // Skip existing file with same ID
        continue;
      }

      // Write physical file
      const spaceDir = `${documentDirectory}vault/${targetSpaceId}/`;
      await ensureDirectoryExists(spaceDir);

      const filePath = `${spaceDir}${fileData.fileId}_${fileData.fileName}`;
      await FileSystem.writeAsStringAsync(filePath, fileData.base64, {
        encoding: EncodingType.Base64,
      });

      const originalMeta = backupObj.metadata[fileData.spaceId]?.find(f => f.id === fileData.fileId);
      if (originalMeta) {
        const restoredMeta: FileMetadata = {
          ...originalMeta,
          id: fileData.fileId,
          filePath,
        };
        if (!updatedMetadata[targetSpaceId]) {
          updatedMetadata[targetSpaceId] = [];
        }
        updatedMetadata[targetSpaceId].push(restoredMeta);
      }
    }

    // Save final merged databases
    await saveVaultSpaces(updatedSpaces);
    await writeAllMetadata(updatedMetadata);
  }
}
