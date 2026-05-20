import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ActivityIndicator, Image, Dimensions, ScrollView, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { cacheDirectory, EncodingType } from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as Sharing from 'expo-sharing';
import { X, ShieldAlert, FileWarning, FileText } from 'lucide-react-native';
import { FileMetadata, readFileContent } from '../services/storage';
import { extractHidden, base64ToBinary } from '../services/polyglot';
import { useVault } from '../services/vaultState';

interface FileViewerModalProps {
  file: FileMetadata | null;
  visible: boolean;
  onClose: () => void;
  viewMode: 'hidden' | 'cover';
}

const getMimeTypeFromExtension = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'html': return 'text/html';
    case 'java': return 'text/plain';
    case 'txt': return 'text/plain';
    case 'js': return 'text/plain';
    case 'ts': return 'text/plain';
    default: return 'application/octet-stream';
  }
};

// Sub-component to isolate the useVideoPlayer hook so it only mounts when videoUri is ready
const VideoPlayerComponent: React.FC<{ videoUri: string }> = ({ videoUri }) => {
  const player = useVideoPlayer(videoUri, (p) => {
    p.loop = true;
    p.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.videoPlayer}
    />
  );
};

export const FileViewerModal: React.FC<FileViewerModalProps> = ({ file, visible, onClose, viewMode }) => {
  const { activeTheme } = useVault();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'text' | 'binary' | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [tempVideoUri, setTempVideoUri] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [tempCoverUri, setTempCoverUri] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !visible) {
      cleanup();
      return;
    }

    loadAndExtractMedia();
  }, [file, visible, viewMode]);

  const cleanup = async () => {
    setImageUri(null);
    setMediaType(null);
    setError(null);
    setTextContent(null);
    
    if (tempVideoUri) {
      try {
        await FileSystem.deleteAsync(tempVideoUri, { idempotent: true });
      } catch (e) {
        console.warn('Failed to delete temp video file:', e);
      }
      setTempVideoUri(null);
    }

    if (tempCoverUri) {
      try {
        await FileSystem.deleteAsync(tempCoverUri, { idempotent: true });
      } catch (e) {
        console.warn('Failed to delete temp cover file:', e);
      }
      setTempCoverUri(null);
    }
  };

  const loadAndExtractMedia = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Read base64 contents from disk
      const polyglotBase64 = await readFileContent(file.filePath);

      // 2. Extract payload using polyglot service
      const result = extractHidden(polyglotBase64);

      if (viewMode === 'cover') {
        const coverBase64 = result.coverBase64;
        const ext = file.coverName.split('.').pop()?.toLowerCase() || '';

        if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
          setMediaType('image');
          setImageUri(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${coverBase64}`);
        } else if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
          // Write video to temp cache so the player can load it
          setMediaType('video');
          const tempUri = `${cacheDirectory || ''}/vault_temp_cover_video_${file.id}.${ext}`;
          await FileSystem.writeAsStringAsync(tempUri, coverBase64, {
            encoding: EncodingType.Base64,
          });
          setTempCoverUri(tempUri);
          setTempVideoUri(tempUri);
        } else if (['java', 'js', 'ts', 'tsx', 'jsx', 'cpp', 'c', 'cs', 'py', 'html', 'xml', 'css', 'txt', 'json', 'sh'].includes(ext)) {
          setMediaType('text');
          const decoded = base64ToBinary(coverBase64);
          setTextContent(decoded);
        } else {
          // PDF or generic binary — save to temp file and offer system viewer
          setMediaType('binary');
          const tempUri = `${cacheDirectory || ''}/vault_temp_cover_${file.id}.${ext}`;
          await FileSystem.writeAsStringAsync(tempUri, coverBase64, {
            encoding: EncodingType.Base64,
          });
          setTempCoverUri(tempUri);
        }
      } else {
        // Reveal hidden media mode
        if (!result.hasHidden || !result.hiddenData) {
          throw new Error('Could not find any hidden media payload in this file.');
        }

        const { mimeType, base64 } = result.hiddenData;

        // 3. Process image or video
        if (mimeType.startsWith('image/')) {
          setMediaType('image');
          setImageUri(`data:${mimeType};base64,${base64}`);
        } else if (mimeType.startsWith('video/')) {
          setMediaType('video');
          
          // Write base64 to temp cache file because Android/iOS players cannot play raw base64 data URIs
          const fileExt = file.hiddenName.split('.').pop() || 'mp4';
          const tempUri = `${cacheDirectory || ''}/vault_temp_video_${file.id}.${fileExt}`;
          
          await FileSystem.writeAsStringAsync(tempUri, base64, {
            encoding: EncodingType.Base64,
          });
          
          setTempVideoUri(tempUri);
        } else {
          throw new Error(`Unsupported hidden media format: ${mimeType}`);
        }
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to extract file contents.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSystemViewer = async () => {
    if (!tempCoverUri || !file) return;
    try {
      await Sharing.shareAsync(tempCoverUri, {
        mimeType: getMimeTypeFromExtension(file.coverName),
        dialogTitle: `Open ${file.coverName}`,
      });
    } catch (e: any) {
      Alert.alert('Error', 'Could not open the file with system viewer.');
    }
  };

  const handleClose = async () => {
    await cleanup();
    onClose();
  };

  const getTitle = () => {
    if (!file) return 'Viewer';
    return viewMode === 'cover' ? file.coverName : file.hiddenName;
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        {/* Header toolbar */}
        <View style={styles.header}>
          <Text numberOfLines={1} style={styles.title}>
            {getTitle()}
          </Text>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <X size={22} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Content Area */}
        <View style={styles.content}>
          {loading && (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color={activeTheme.primary} />
              <Text style={[styles.loaderText, { color: activeTheme.textSecondary }]}>
                {viewMode === 'cover' ? 'Extracting cover document...' : 'Decrypting and extracting hidden data...'}
              </Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <ShieldAlert size={60} color={activeTheme.danger} />
              <Text style={styles.errorTitle}>Access Warning</Text>
              <Text style={[styles.errorText, { color: activeTheme.textSecondary }]}>
                {error}
              </Text>
            </View>
          )}

          {!loading && !error && mediaType === 'image' && imageUri && (
            <Image
              source={{ uri: imageUri }}
              style={styles.imageViewer}
              resizeMode="contain"
            />
          )}

          {!loading && !error && mediaType === 'video' && tempVideoUri && (
            <VideoPlayerComponent videoUri={tempVideoUri} />
          )}

          {!loading && !error && mediaType === 'text' && textContent && (
            <ScrollView style={styles.textScrollView} contentContainerStyle={styles.textContainer}>
              <Text style={styles.codeText}>{textContent}</Text>
            </ScrollView>
          )}

          {!loading && !error && mediaType === 'binary' && (
            <View style={styles.binaryContainer}>
              <FileText size={72} color={activeTheme.primary} />
              <Text style={styles.binaryTitle}>{file?.coverName}</Text>
              <Text style={[styles.binarySubtitle, { color: activeTheme.textSecondary }]}>
                This is a masked cover file ({file?.coverName.split('.').pop()?.toUpperCase()} document).
              </Text>
              <Pressable
                onPress={handleOpenSystemViewer}
                style={({ pressed }) => [
                  styles.openSystemBtn,
                  { backgroundColor: activeTheme.primary },
                  pressed && styles.buttonPressed
                ]}
              >
                <Text style={styles.openSystemBtnText}>Open in System Viewer</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const { width, height } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 20,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  loaderText: {
    marginTop: 14,
    fontSize: 14,
    textAlign: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  imageViewer: {
    width: width,
    height: height - 120,
  },
  videoPlayer: {
    width: width,
    height: height - 120,
    backgroundColor: '#000',
  },
  textScrollView: {
    flex: 1,
    width: width - 30,
    backgroundColor: '#0D0A16',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 8,
    marginVertical: 20,
  },
  textContainer: {
    padding: 16,
  },
  codeText: {
    color: '#D4CFE6',
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
  binaryContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  binaryTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
    textAlign: 'center',
  },
  binarySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 10,
    lineHeight: 18,
  },
  openSystemBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openSystemBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonPressed: {
    opacity: 0.85,
  },
});
