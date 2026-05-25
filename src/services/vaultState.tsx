import React, { createContext, useContext, useState, useEffect } from 'react';
import { getVaultSpaces, saveVaultSpaces, getFilesForSpace, deleteFileFromSpace, VaultSpace, FileMetadata, createBackupFile, restoreBackup, shareFile, getCalculatorTheme, saveCalculatorTheme } from './storage';
import { Themes, Theme } from './theme';

interface VaultContextType {
  spaces: VaultSpace[];
  activeSpace: VaultSpace | null;
  activeFiles: FileMetadata[];
  activeTheme: Theme;
  calculatorThemeId: string;
  isLoading: boolean;
  unlockSpace: (formula: string) => Promise<VaultSpace | null>;
  loadActiveSpace: (spaceId: string) => Promise<void>;
  reloadFiles: () => Promise<void>;
  createNewSpace: (name: string, passwordFormula: string, themeId: string) => Promise<VaultSpace>;
  updateSpacePassword: (spaceId: string, newPassword: string) => Promise<boolean>;
  updateSpaceTheme: (spaceId: string, themeId: string) => Promise<void>;
  updateCalculatorTheme: (themeId: string) => Promise<void>;
  deleteSpace: (spaceId: string) => Promise<void>;
  lockVault: () => void;
  backupVault: () => Promise<boolean>;
  restoreVault: (backupObj: any, strategy: 'merge' | 'replace') => Promise<{ success: boolean; message: string }>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [spaces, setSpaces] = useState<VaultSpace[]>([]);
  const [activeSpace, setActiveSpace] = useState<VaultSpace | null>(null);
  const [activeFiles, setActiveFiles] = useState<FileMetadata[]>([]);
  const [activeTheme, setActiveTheme] = useState<Theme>(Themes.cyberNeon);
  const [calculatorThemeId, setCalculatorThemeId] = useState<string>('cyberNeon');
  const [isLoading, setIsLoading] = useState(true);

  // Initialize and load spaces
  useEffect(() => {
    async function init() {
      const loadedSpaces = await getVaultSpaces();
      const loadedTheme = await getCalculatorTheme();
      setSpaces(loadedSpaces);
      setCalculatorThemeId(loadedTheme);
      setIsLoading(false);
    }
    init();
  }, []);

  // Update theme when active space changes
  useEffect(() => {
    if (activeSpace) {
      const theme = Themes[activeSpace.themeId] || Themes.cyberNeon;
      setActiveTheme(theme);
    } else {
      const theme = Themes[calculatorThemeId] || Themes.cyberNeon;
      setActiveTheme(theme);
    }
  }, [activeSpace, calculatorThemeId]);

  const unlockSpace = async (formula: string): Promise<VaultSpace | null> => {
    // Normalize formula: trim whitespace
    const cleanFormula = formula.trim().replace(/\s+/g, '');
    const found = spaces.find(s => s.passwordFormula.trim().replace(/\s+/g, '') === cleanFormula);
    if (found) {
      await loadActiveSpace(found.id);
      return found;
    }
    return null;
  };

  const loadActiveSpace = async (spaceId: string) => {
    const space = spaces.find(s => s.id === spaceId);
    if (space) {
      setActiveSpace(space);
      const files = await getFilesForSpace(spaceId);
      setActiveFiles(files);
    }
  };

  const reloadFiles = async () => {
    if (activeSpace) {
      const files = await getFilesForSpace(activeSpace.id);
      setActiveFiles(files);
    }
  };

  const createNewSpace = async (name: string, passwordFormula: string, themeId: string): Promise<VaultSpace> => {
    const newSpace: VaultSpace = {
      id: `space_${Date.now()}`,
      name,
      passwordFormula: passwordFormula.trim(),
      themeId,
      mode: 'advanced',
    };
    const updatedSpaces = [...spaces, newSpace];
    setSpaces(updatedSpaces);
    await saveVaultSpaces(updatedSpaces);
    return newSpace;
  };

  const updateSpacePassword = async (spaceId: string, newPassword: string): Promise<boolean> => {
    // Check if new password formula conflicts with other spaces
    const cleanNew = newPassword.trim().replace(/\s+/g, '');
    const conflict = spaces.find(s => s.id !== spaceId && s.passwordFormula.trim().replace(/\s+/g, '') === cleanNew);
    if (conflict) {
      return false; // Conflict found
    }

    const updated = spaces.map(s => {
      if (s.id === spaceId) {
        const updatedSpace = { ...s, passwordFormula: newPassword.trim() };
        if (activeSpace && activeSpace.id === spaceId) {
          setActiveSpace(updatedSpace);
        }
        return updatedSpace;
      }
      return s;
    });

    setSpaces(updated);
    await saveVaultSpaces(updated);
    return true;
  };

  const updateSpaceTheme = async (spaceId: string, themeId: string) => {
    const updated = spaces.map(s => {
      if (s.id === spaceId) {
        const updatedSpace = { ...s, themeId };
        if (activeSpace && activeSpace.id === spaceId) {
          setActiveSpace(updatedSpace);
        }
        return updatedSpace;
      }
      return s;
    });

    setSpaces(updated);
    await saveVaultSpaces(updated);
  };

  const updateCalculatorTheme = async (themeId: string) => {
    setCalculatorThemeId(themeId);
    await saveCalculatorTheme(themeId);
  };

  const deleteSpace = async (spaceId: string) => {
    // Prevent deleting the last space
    if (spaces.length <= 1) {
      throw new Error('You must keep at least one vault space.');
    }

    // Delete physical files
    const files = await getFilesForSpace(spaceId);
    for (const file of files) {
      await deleteFileFromSpace(spaceId, file.id);
    }

    const updated = spaces.filter(s => s.id !== spaceId);
    setSpaces(updated);
    await saveVaultSpaces(updated);

    if (activeSpace && activeSpace.id === spaceId) {
      lockVault();
    }
  };

  const lockVault = () => {
    setActiveSpace(null);
    setActiveFiles([]);
  };

  const backupVault = async (): Promise<boolean> => {
    try {
      const backupPath = await createBackupFile();
      const fileName = `polyglot_backup_${Date.now()}.json`;
      await shareFile(backupPath, fileName);
      return true;
    } catch (error) {
      console.error('Backup error:', error);
      return false;
    }
  };

  const restoreVault = async (
    backupObj: any,
    strategy: 'merge' | 'replace'
  ): Promise<{ success: boolean; message: string }> => {
    try {
      await restoreBackup(backupObj, strategy);
      const loadedSpaces = await getVaultSpaces();
      setSpaces(loadedSpaces);
      lockVault();
      return { success: true, message: 'Vault restored successfully!' };
    } catch (error: any) {
      console.error('Restore error:', error);
      return { success: false, message: error.message || 'Failed to restore vault.' };
    }
  };

  return (
    <VaultContext.Provider
      value={{
        spaces,
        activeSpace,
        activeFiles,
        activeTheme,
        calculatorThemeId,
        isLoading,
        unlockSpace,
        loadActiveSpace,
        reloadFiles,
        createNewSpace,
        updateSpacePassword,
        updateSpaceTheme,
        updateCalculatorTheme,
        deleteSpace,
        lockVault,
        backupVault,
        restoreVault,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (context === undefined) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
};
