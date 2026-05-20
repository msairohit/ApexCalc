import React, { createContext, useContext, useState, useEffect } from 'react';
import { getVaultSpaces, saveVaultSpaces, getFilesForSpace, deleteFileFromSpace, VaultSpace, FileMetadata } from './storage';
import { Themes, Theme } from './theme';

interface VaultContextType {
  spaces: VaultSpace[];
  activeSpace: VaultSpace | null;
  activeFiles: FileMetadata[];
  activeTheme: Theme;
  isLoading: boolean;
  unlockSpace: (formula: string) => Promise<VaultSpace | null>;
  loadActiveSpace: (spaceId: string) => Promise<void>;
  reloadFiles: () => Promise<void>;
  createNewSpace: (name: string, passwordFormula: string, themeId: string) => Promise<VaultSpace>;
  updateSpacePassword: (spaceId: string, newPassword: string) => Promise<boolean>;
  updateSpaceTheme: (spaceId: string, themeId: string) => Promise<void>;
  deleteSpace: (spaceId: string) => Promise<void>;
  lockVault: () => void;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [spaces, setSpaces] = useState<VaultSpace[]>([]);
  const [activeSpace, setActiveSpace] = useState<VaultSpace | null>(null);
  const [activeFiles, setActiveFiles] = useState<FileMetadata[]>([]);
  const [activeTheme, setActiveTheme] = useState<Theme>(Themes.cyberNeon);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize and load spaces
  useEffect(() => {
    async function init() {
      const loadedSpaces = await getVaultSpaces();
      setSpaces(loadedSpaces);
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
      setActiveTheme(Themes.cyberNeon); // Default back to Cyber Neon for calculator
    }
  }, [activeSpace]);

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

  return (
    <VaultContext.Provider
      value={{
        spaces,
        activeSpace,
        activeFiles,
        activeTheme,
        isLoading,
        unlockSpace,
        loadActiveSpace,
        reloadFiles,
        createNewSpace,
        updateSpacePassword,
        updateSpaceTheme,
        deleteSpace,
        lockVault,
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
