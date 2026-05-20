import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { EncodingType } from 'expo-file-system/legacy';
import { 
  Lock, 
  Settings as SettingsIcon, 
  Search, 
  FolderOpen, 
  FileUp,
  FilePlus2,
  Plus
} from 'lucide-react-native';
import { useVault } from '../../services/vaultState';
import { FileCard } from '../../components/FileCard';
import { FileViewerModal } from '../../components/FileViewerModal';
import { CreatePolyglotModal } from '../../components/CreatePolyglotModal';
import { FileMetadata, savePolyglotFile } from '../../services/storage';
import { extractHidden } from '../../services/polyglot';

export default function VaultSpaceScreen() {
  const router = useRouter();
  const { spaceId } = useLocalSearchParams<{ spaceId: string }>();
  const { 
    activeSpace, 
    activeFiles, 
    activeTheme, 
    isLoading, 
    loadActiveSpace, 
    reloadFiles, 
    lockVault 
  } = useVault();

  // Modals Visibility
  const [viewerVisible, setViewerVisible] = useState(false);
  const [wizardVisible, setWizardVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileMetadata | null>(null);
  const [viewerMode, setViewerMode] = useState<'hidden' | 'cover'>('hidden');

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'pdf' | 'code' | 'html' | 'media'>('all');
  const [importing, setImporting] = useState(false);

  // Sync state with local param
  useEffect(() => {
    if (spaceId) {
      loadActiveSpace(spaceId);
    }
  }, [spaceId]);

  const isSimple = activeSpace?.mode === 'simple';

  const handleLock = () => {
    lockVault();
    router.replace('/');
  };

  const handleOpenSettings = () => {
    router.push('/vault/settings');
  };

  const handleOpenViewer = (file: FileMetadata, viewMode: 'hidden' | 'cover') => {
    setSelectedFile(file);
    setViewerMode(viewMode);
    setViewerVisible(true);
  };

  // Simple vault: import images & videos directly, no polyglot terminology
  const handleSimpleImport = async () => {
    if (!activeSpace) return;
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'video/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        setImporting(false);
        return;
      }
      const asset = result.assets[0];
      const mime = asset.mimeType || 'application/octet-stream';
      const base64Content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: EncodingType.Base64,
      });
      await savePolyglotFile(
        activeSpace.id,
        asset.name,
        base64Content,
        asset.name,
        asset.name,
        mime,
        asset.size || base64Content.length * 0.75
      );
      await reloadFiles();
    } catch (e: any) {
      Alert.alert('Import Failed', e.message || 'Error occurred while loading file.');
    } finally {
      setImporting(false);
    }
  };

  // Advanced vault: full polyglot import with detection
  const handleAdvancedImport = async () => {
    if (!activeSpace) return;
    setImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || result.assets.length === 0) {
        setImporting(false);
        return;
      }
      const asset = result.assets[0];
      const base64Content = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: EncodingType.Base64,
      });
      const polyInfo = extractHidden(base64Content);
      if (polyInfo.hasHidden && polyInfo.hiddenData) {
        await savePolyglotFile(
          activeSpace.id, asset.name, base64Content,
          asset.name, polyInfo.hiddenData.name, polyInfo.hiddenData.mimeType,
          asset.size || base64Content.length * 0.75
        );
        Alert.alert('Import Successful', `Detected & imported polyglot file "${asset.name}" hiding "${polyInfo.hiddenData.name}".`);
      } else {
        const mime = asset.mimeType || '';
        if (mime.startsWith('image/') || mime.startsWith('video/')) {
          await savePolyglotFile(
            activeSpace.id, asset.name, base64Content,
            asset.name, asset.name, mime,
            asset.size || base64Content.length * 0.75
          );
          Alert.alert('Import Successful', `Saved "${asset.name}" to vault.`);
        } else {
          Alert.alert('Import Refused', 'Direct imports are restricted to images, videos, or valid Polyglot files. Use "Create Polyglot" to mask other formats.');
        }
      }
      await reloadFiles();
    } catch (e: any) {
      Alert.alert('Import Failed', e.message || 'Error occurred while loading file.');
    } finally {
      setImporting(false);
    }
  };

  const handleImportFile = isSimple ? handleSimpleImport : handleAdvancedImport;

  // Filter files based on search query & selected category
  const filteredFiles = activeFiles.filter((file) => {
    // 1. Search Query filter
    const matchesSearch = 
      file.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      file.hiddenName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    // 2. Category filter
    const ext = file.fileName.split('.').pop()?.toLowerCase() || '';
    switch (activeFilter) {
      case 'pdf':
        return ext === 'pdf';
      case 'code':
        return ['java', 'js', 'ts', 'tsx', 'cpp', 'c', 'cs', 'py'].includes(ext);
      case 'html':
        return ext === 'html' || ext === 'xml';
      case 'media':
        return ['png', 'jpg', 'jpeg', 'gif', 'mp4', 'mov'].includes(ext);
      default:
        return true;
    }
  });

  if (isLoading || !activeSpace) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: '#0B0813' }]}>
        <ActivityIndicator size="large" color="#D800FF" />
        <Text style={styles.loadingText}>Unlocking space...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: activeTheme.background }]}>
      {/* Header Toolbar */}
      <View style={styles.header}>
        <Pressable 
          onPress={handleLock} 
          style={({ pressed }) => [
            styles.headerButton, 
            { backgroundColor: `${activeTheme.primary}15` },
            pressed && styles.buttonPressed
          ]}
        >
          <Lock size={18} color={activeTheme.primary} />
          <Text style={[styles.headerButtonText, { color: activeTheme.primary }]}>Lock</Text>
        </Pressable>

        {/* Simple vault shows no title; advanced shows the space name */}
        <Text style={styles.vaultTitle}>{isSimple ? '' : activeSpace.name}</Text>

        {/* Settings only available in advanced vault */}
        {isSimple ? (
          <View style={{ width: 38 }} />
        ) : (
          <Pressable 
            onPress={handleOpenSettings}
            style={({ pressed }) => [
              styles.iconHeaderBtn,
              pressed && styles.buttonPressed
            ]}
          >
            <SettingsIcon size={22} color="#FFFFFF" />
          </Pressable>
        )}
      </View>

      {/* Search Input */}
      <View style={styles.searchSection}>
        <View style={[styles.searchWrapper, { 
          backgroundColor: activeTheme.cardBackground,
          borderColor: activeTheme.borderColor 
        }]}>
          <Search size={18} color={activeTheme.textSecondary} style={styles.searchIcon} />
          <TextInput
            placeholder="Search files..."
            placeholderTextColor={activeTheme.textSecondary + '70'}
            value={searchQuery}
            onChangeText={setSearchQuery}
            style={[styles.searchInput, { color: activeTheme.text }]}
          />
        </View>
      </View>

      {/* Filter Tabs — advanced vault only */}
      {!isSimple && (
        <View style={styles.filtersWrapper}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersScroll}>
            {[
              { id: 'all', label: 'All Files' },
              { id: 'pdf', label: 'PDFs' },
              { id: 'code', label: 'Source Code' },
              { id: 'html', label: 'Web Pages' },
              { id: 'media', label: 'Direct Media' }
            ].map((filter) => {
              const isSelected = activeFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  onPress={() => setActiveFilter(filter.id as any)}
                  style={[
                    styles.filterPill,
                    {
                      backgroundColor: isSelected ? activeTheme.primary : 'rgba(255,255,255,0.05)',
                      borderColor: isSelected ? 'transparent' : activeTheme.borderColor,
                      borderWidth: 1
                    }
                  ]}
                >
                  <Text style={[styles.filterPillText, { color: isSelected ? '#FFFFFF' : activeTheme.text }]}>
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* File List Grid */}
      <ScrollView contentContainerStyle={styles.filesScrollContent}>
        {filteredFiles.length > 0 ? (
          filteredFiles.map((file) => (
            <FileCard
              key={file.id}
              file={file}
              onReveal={handleOpenViewer}
              onDeleteSuccess={reloadFiles}
              spaceMode={activeSpace.mode}
            />
          ))
        ) : (
          <View style={styles.emptyContainer}>
            <FolderOpen size={72} color={activeTheme.primary + '50'} />
            <Text style={styles.emptyTitle}>{isSimple ? 'No Files Yet' : 'Vault is Empty'}</Text>
            <Text style={[styles.emptySubtitle, { color: activeTheme.textSecondary }]}>
              {searchQuery
                ? 'No files match your query.'
                : isSimple
                ? 'Tap the button below to add photos or videos.'
                : 'This vault space is currently secure. Add files below.'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom Floating Options panel */}
      <View style={styles.actionPanel}>
        {importing ? (
          <View style={styles.importLoader}>
            <ActivityIndicator size="small" color={activeTheme.primary} />
            <Text style={[styles.importLoaderText, { color: activeTheme.textSecondary }]}>Adding file...</Text>
          </View>
        ) : isSimple ? (
          // Simple vault: single centered Add button
          <Pressable
            onPress={handleImportFile}
            style={({ pressed }) => [
              styles.actionPanelBtnFull,
              { backgroundColor: activeTheme.primary },
              pressed && styles.buttonPressed
            ]}
          >
            <Plus size={20} color="#FFFFFF" />
            <Text style={styles.actionPanelBtnText}>Add File</Text>
          </Pressable>
        ) : (
          // Advanced vault: Create Polyglot + Import side by side
          <View style={styles.actionButtonsRow}>
            <Pressable
              onPress={() => setWizardVisible(true)}
              style={({ pressed }) => [
                styles.actionPanelBtn,
                { backgroundColor: activeTheme.primary },
                pressed && styles.buttonPressed
              ]}
            >
              <FilePlus2 size={18} color="#FFFFFF" />
              <Text style={styles.actionPanelBtnText}>Create Polyglot</Text>
            </Pressable>
            <Pressable
              onPress={handleImportFile}
              style={({ pressed }) => [
                styles.actionPanelBtnSecondary,
                { borderColor: activeTheme.borderColor },
                pressed && styles.buttonPressed
              ]}
            >
              <FileUp size={18} color="#FFFFFF" />
              <Text style={styles.actionPanelBtnSecondaryText}>Import File</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* modals */}
      <FileViewerModal
        file={selectedFile}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
        viewMode={viewerMode}
      />

      <CreatePolyglotModal
        visible={wizardVisible}
        onClose={() => setWizardVisible(false)}
        onSuccess={reloadFiles}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFFFFF',
    marginTop: 14,
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  headerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  vaultTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  iconHeaderBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  searchSection: {
    paddingHorizontal: 20,
    marginVertical: 10,
  },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    height: 46,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'System',
  },
  filtersWrapper: {
    height: 48,
    marginBottom: 8,
  },
  filtersScroll: {
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
  },
  filesScrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 18,
  },
  actionPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingTop: 15,
    paddingBottom: 25,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionPanelBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 14,
  },
  actionPanelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginRight: 10,
    height: 48,
    borderRadius: 12,
  },
  actionPanelBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  actionPanelBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    height: 48,
    borderWidth: 1.5,
    borderRadius: 12,
  },
  actionPanelBtnSecondaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  importLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
  },
  importLoaderText: {
    fontSize: 14,
    marginLeft: 10,
  },
});
