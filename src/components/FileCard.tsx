import {
  Calendar,
  Eye,
  EyeOff,
  FileCode,
  FileText,
  File as GenericFile,
  Globe,
  Image as ImageIcon,
  Layers,
  Share2,
  Trash2,
  Video as VideoIcon,
  X
} from 'lucide-react-native';
import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { FileMetadata, deleteFileFromSpace, shareFile, shareHiddenFile } from '../services/storage';
import { useVault } from '../services/vaultState';
import { GlassCard } from './GlassCard';

interface FileCardProps {
  file: FileMetadata;
  onReveal: (file: FileMetadata, viewMode: 'hidden' | 'cover') => void;
  onDeleteSuccess: () => void;
  spaceMode?: 'simple' | 'advanced';
}

export const FileCard: React.FC<FileCardProps> = ({ file, onReveal, onDeleteSuccess, spaceMode = 'advanced' }) => {
  const { activeTheme, activeSpace } = useVault();
  const [menuVisible, setMenuVisible] = useState(false);
  const isSimple = spaceMode === 'simple';

  const handleShareHidden = async () => {
    try {
      await shareHiddenFile(file.filePath, file.hiddenName);
      setMenuVisible(false);
    } catch (e: any) {
      Alert.alert('Share Failed', e.message || 'Could not share hidden content.');
    }
  };

  // Helper to format file size
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Helper to format timestamp
  const formatDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' });
  };

  // Get file extension
  const getCoverExtension = () => {
    return file.coverName.split('.').pop()?.toLowerCase() || '';
  };

  // Get appropriate Lucide icon and color
  const getFileIconInfo = () => {
    const ext = getCoverExtension();
    switch (ext) {
      case 'pdf':
        return { icon: FileText, color: '#EF4444' }; // Red
      case 'java':
      case 'js':
      case 'ts':
      case 'tsx':
      case 'jsx':
      case 'cpp':
      case 'c':
      case 'cs':
      case 'swift':
        return { icon: FileCode, color: '#3B82F6' }; // Blue
      case 'html':
      case 'xml':
        return { icon: Globe, color: '#F59E0B' }; // Orange
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return { icon: ImageIcon, color: '#10B981' }; // Green
      case 'mp4':
      case 'mov':
      case 'avi':
      case 'mkv':
        return { icon: VideoIcon, color: '#EC4899' }; // Pink
      default:
        return { icon: GenericFile, color: '#9CA3AF' }; // Grey
    }
  };

  const { icon: FileIcon, color: iconColor } = getFileIconInfo();

  const handleExport = async () => {
    try {
      await shareFile(file.filePath, file.fileName);
      setMenuVisible(false);
    } catch (e: any) {
      Alert.alert('Export Failed', e.message || 'Could not export file.');
    }
  };

  const handleDelete = () => {
    if (!activeSpace) return;
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${file.fileName}" from the vault?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteFileFromSpace(activeSpace.id, file.id);
            setMenuVisible(false);
            onDeleteSuccess();
          }
        }
      ]
    );
  };

  const handleViewHidden = () => {
    setMenuVisible(false);
    onReveal(file, 'hidden');
  };

  const handleViewCover = () => {
    setMenuVisible(false);
    onReveal(file, 'cover');
  };

  return (
    <>
      <Pressable onPress={() => setMenuVisible(true)} style={styles.pressableCard}>
        <GlassCard style={styles.cardContainer}>
          <View style={styles.contentRow}>
            {/* File Icon with glow background */}
            <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
              <FileIcon size={30} color={iconColor} />
            </View>

            {/* File Metadata Info */}
            <View style={styles.infoContainer}>
              <Text numberOfLines={1} style={styles.fileName}>
                {file.fileName}
              </Text>

              {/* Mask row — only shown in advanced (polyglot) mode */}
              {!isSimple && (
                <View style={styles.metaRow}>
                  <Layers size={12} color={activeTheme.textSecondary} />
                  <Text style={[styles.metaText, { color: activeTheme.textSecondary }]}>
                    Mask: {getCoverExtension().toUpperCase()}
                  </Text>
                  <Text style={[styles.bullet, { color: activeTheme.textSecondary }]}>•</Text>
                  <Text style={[styles.metaText, { color: activeTheme.textSecondary }]}>
                    {formatBytes(file.fileSize)}
                  </Text>
                </View>
              )}

              {/* Size shown standalone in simple mode */}
              {isSimple && (
                <View style={styles.metaRow}>
                  <Text style={[styles.metaText, { color: activeTheme.textSecondary }]}>
                    {formatBytes(file.fileSize)}
                  </Text>
                </View>
              )}

              <View style={styles.metaRow}>
                <Calendar size={12} color={activeTheme.textSecondary} />
                <Text style={[styles.metaText, { color: activeTheme.textSecondary }]}>
                  {formatDate(file.timestamp)}
                </Text>
              </View>
            </View>
          </View>
        </GlassCard>
      </Pressable>

      {/* Action Menu Sheet / Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={menuVisible}
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={[styles.sheetContent, { backgroundColor: activeTheme.gridBackground }]}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={styles.sheetHeaderIconTitle}>
                <FileIcon size={24} color={iconColor} style={styles.sheetTitleIcon} />
                <View>
                  <Text numberOfLines={1} style={styles.sheetTitle}>
                    {file.fileName}
                  </Text>
                  <Text style={[styles.sheetSubtitle, { color: activeTheme.textSecondary }]}>
                    Size: {formatBytes(file.fileSize)} • Added: {formatDate(file.timestamp)}
                  </Text>
                </View>
              </View>
              <Pressable onPress={() => setMenuVisible(false)} style={styles.closeButton}>
                <X size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <View style={[styles.divider, { backgroundColor: activeTheme.borderColor }]} />

            {/* Menu Actions */}
            <View style={styles.menuList}>

              {isSimple ? (
                // Simple vault: single View File action
                <Pressable
                  onPress={() => { setMenuVisible(false); onReveal(file, 'cover'); }}
                  style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                >
                  <View style={[styles.menuItemIconBg, { backgroundColor: `${activeTheme.primary}15` }]}>
                    <Eye size={20} color={activeTheme.primary} />
                  </View>
                  <View style={styles.menuItemTextContainer}>
                    <Text style={styles.menuItemTitle}>View File</Text>
                    <Text style={[styles.menuItemDesc, { color: activeTheme.textSecondary }]}>
                      Open {file.fileName}
                    </Text>
                  </View>
                </Pressable>
              ) : (
                // Advanced vault: View Cover + Reveal Hidden
                <>
                  <Pressable
                    onPress={handleViewCover}
                    style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                  >
                    <View style={[styles.menuItemIconBg, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                      <Eye size={20} color="#F59E0B" />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={styles.menuItemTitle}>View Cover File</Text>
                      <Text style={[styles.menuItemDesc, { color: activeTheme.textSecondary }]}>
                        View the masked {file.coverName.split('.').pop()?.toUpperCase()} document ({file.coverName})
                      </Text>
                    </View>
                  </Pressable>

                  <Pressable
                    onPress={handleViewHidden}
                    style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                  >
                    <View style={[styles.menuItemIconBg, { backgroundColor: `${activeTheme.primary}15` }]}>
                      <EyeOff size={20} color={activeTheme.primary} />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={styles.menuItemTitle}>Reveal Hidden Content</Text>
                      <Text style={[styles.menuItemDesc, { color: activeTheme.textSecondary }]}>
                        Extract and view the hidden {file.hiddenMime.startsWith('video/') ? 'video' : 'image'} ({file.hiddenName})
                      </Text>
                    </View>
                  </Pressable>

                  {/* Share Hidden Content */}
                  <Pressable
                    onPress={handleShareHidden}
                    style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
                  >
                    <View style={[styles.menuItemIconBg, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                      <Share2 size={20} color="#10B981" />
                    </View>
                    <View style={styles.menuItemTextContainer}>
                      <Text style={styles.menuItemTitle}>Share Hidden Content</Text>
                      <Text style={[styles.menuItemDesc, { color: activeTheme.textSecondary }]}>
                        Share or save the extracted hidden file ({file.hiddenName})
                      </Text>
                    </View>
                  </Pressable>
                </>
              )}

              {/* Action: Export / Share */}
              <Pressable
                onPress={handleExport}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed
                ]}
              >
                <View style={[styles.menuItemIconBg, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
                  <Share2 size={20} color="#3B82F6" />
                </View>
                <View style={styles.menuItemTextContainer}>
                  <Text style={styles.menuItemTitle}>
                    {isSimple ? 'Share File' : 'Export Polyglot File'}
                  </Text>
                  <Text style={[styles.menuItemDesc, { color: activeTheme.textSecondary }]}>
                    {isSimple
                      ? `Share or save ${file.fileName} to device storage`
                      : `Share or save the masked file (.${getCoverExtension()}) to device storage`}
                  </Text>
                </View>
              </Pressable>

              {/* Action: Delete */}
              <Pressable
                onPress={handleDelete}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && styles.menuItemPressed
                ]}
              >
                <View style={[styles.menuItemIconBg, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                  <Trash2 size={20} color="#EF4444" />
                </View>
                <View style={styles.menuItemTextContainer}>
                  <Text style={[styles.menuItemTitle, { color: '#EF4444' }]}>Delete File</Text>
                  <Text style={[styles.menuItemDesc, { color: activeTheme.textSecondary }]}>
                    {isSimple
                      ? 'Permanently delete this file from the vault'
                      : 'Permanently delete this file and its hidden content from the vault'}
                  </Text>
                </View>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  pressableCard: {
    marginVertical: 6,
    width: '100%',
  },
  cardContainer: {
    padding: 14,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 50,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  fileName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    marginLeft: 6,
  },
  bullet: {
    fontSize: 12,
    marginHorizontal: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 35,
    maxHeight: '75%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetHeaderIconTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  sheetTitleIcon: {
    marginRight: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    maxWidth: '85%',
  },
  sheetSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    width: '100%',
    marginBottom: 16,
  },
  menuList: {
    width: '100%',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginVertical: 4,
  },
  menuItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  menuItemIconBg: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuItemTextContainer: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  menuItemDesc: {
    fontSize: 12,
    marginTop: 2,
  },
});
