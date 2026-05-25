import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TextInput, ActivityIndicator, Alert, ScrollView, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { EncodingType } from 'expo-file-system/legacy';
import { X, Upload, FileText, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react-native';
import { useVault } from '../services/vaultState';
import { savePolyglotFile } from '../services/storage';
import { stitchFiles } from '../services/polyglot';
import { GlassCard } from './GlassCard';

interface CreatePolyglotModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Selection {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

export const CreatePolyglotModal: React.FC<CreatePolyglotModalProps> = ({ visible, onClose, onSuccess }) => {
  const { activeTheme, activeSpace } = useVault();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Selections
  const [hiddenFile, setHiddenFile] = useState<Selection | null>(null);
  const [coverFile, setCoverFile] = useState<Selection | null>(null);
  const [outputName, setOutputName] = useState('');

  const resetState = () => {
    setStep(1);
    setHiddenFile(null);
    setCoverFile(null);
    setOutputName('');
    setLoading(false);
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Pick hidden file (Image/Video)
  const handlePickHidden = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        // Get file size
        const fileInfo = await FileSystem.getInfoAsync(asset.uri);
        const fileSize = fileInfo.exists ? fileInfo.size : 0;
        
        const name = asset.fileName || `secret_${Date.now()}.${asset.mimeType?.split('/')[1] || 'png'}`;
        
        setHiddenFile({
          uri: asset.uri,
          name,
          size: fileSize,
          mimeType: asset.mimeType || 'image/png',
        });
        
        // Pre-move to next step
        setStep(2);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Selection Error', 'Failed to pick secret media.');
    }
  };

  // Pick cover file (PDF, code, doc, etc.)
  const handlePickCover = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        
        setCoverFile({
          uri: asset.uri,
          name: asset.name,
          size: asset.size || 0,
          mimeType: asset.mimeType || 'application/octet-stream',
        });

        // Autofill output name using cover name
        setOutputName(asset.name);
        setStep(3);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Selection Error', 'Failed to pick cover file.');
    }
  };

  // Create the polyglot and save it
  const handleCompile = async () => {
    if (!hiddenFile || !coverFile || !outputName.trim() || !activeSpace) {
      Alert.alert('Incomplete Form', 'Please complete all steps before compiling.');
      return;
    }

    setLoading(true);

    try {
      // 1. Read files as base64
      const coverBase64 = await FileSystem.readAsStringAsync(coverFile.uri, {
        encoding: EncodingType.Base64,
      });

      const hiddenBase64 = await FileSystem.readAsStringAsync(hiddenFile.uri, {
        encoding: EncodingType.Base64,
      });

      // 2. Stitch files together
      const polyglotBase64 = stitchFiles(
        coverBase64,
        hiddenBase64,
        coverFile.name,
        hiddenFile.name,
        hiddenFile.mimeType
      );

      // Calculate new total size
      const totalSize = coverFile.size + hiddenFile.size;

      // 3. Save polyglot file to native storage
      await savePolyglotFile(
        activeSpace.id,
        outputName.trim(),
        polyglotBase64,
        coverFile.name,
        hiddenFile.name,
        hiddenFile.mimeType,
        totalSize
      );

      setStep(4); // Success step
    } catch (e: any) {
      console.error(e);
      Alert.alert('Compilation Failed', e.message || 'Stitching process crashed.');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: activeTheme.background }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Hide Content in Polyglot</Text>
            <Pressable onPress={handleClose} style={styles.closeButton}>
              <X size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Progress Indicators */}
          <View style={styles.stepsIndicator}>
            {[1, 2, 3, 4].map((s) => (
              <View key={s} style={styles.stepIndicatorWrapper}>
                <View
                  style={[
                    styles.stepDot,
                    {
                      backgroundColor:
                        step >= s ? activeTheme.primary : 'rgba(255, 255, 255, 0.1)',
                      borderColor: step === s ? '#FFFFFF' : 'transparent',
                      borderWidth: step === s ? 1.5 : 0,
                    },
                  ]}
                >
                  <Text style={styles.stepDotText}>{s}</Text>
                </View>
                {s < 4 && (
                  <View
                    style={[
                      styles.stepLine,
                      {
                        backgroundColor:
                          step > s ? activeTheme.primary : 'rgba(255, 255, 255, 0.1)',
                      },
                    ]}
                  />
                )}
              </View>
            ))}
          </View>

          {/* Content Body */}
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Step 1: Select secret image or video */}
            {step === 1 && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Step 1: Select Secret Content</Text>
                <Text style={[styles.stepDesc, { color: activeTheme.textSecondary }]}>
                  Choose the image or video that you want to hide.
                </Text>

                {hiddenFile ? (
                  <GlassCard style={styles.previewCard}>
                    {hiddenFile.mimeType.startsWith('image/') ? (
                      <Image source={{ uri: hiddenFile.uri }} style={styles.mediaPreview} />
                    ) : (
                      <View style={styles.videoPreviewFallback}>
                        <FileText size={40} color={activeTheme.primary} />
                        <Text style={styles.videoPreviewText}>Video Selected</Text>
                      </View>
                    )}
                    <Text numberOfLines={1} style={styles.selectedName}>
                      {hiddenFile.name}
                    </Text>
                    <Text style={[styles.selectedSize, { color: activeTheme.textSecondary }]}>
                      {formatBytes(hiddenFile.size)} • {hiddenFile.mimeType}
                    </Text>
                    <Pressable
                      onPress={handlePickHidden}
                      style={[styles.actionBtn, { borderColor: activeTheme.borderColor }]}
                    >
                      <Text style={styles.actionBtnText}>Change Media</Text>
                    </Pressable>
                  </GlassCard>
                ) : (
                  <Pressable
                    onPress={handlePickHidden}
                    style={({ pressed }) => [
                      styles.uploadTrigger,
                      { borderColor: activeTheme.borderColor, backgroundColor: pressed ? 'rgba(255, 255, 255, 0.02)' : 'transparent' },
                    ]}
                  >
                    <Upload size={48} color={activeTheme.primary} />
                    <Text style={styles.uploadTriggerText}>Select Image or Video</Text>
                    <Text style={[styles.uploadTriggerSub, { color: activeTheme.textSecondary }]}>
                      Pick from device gallery
                    </Text>
                  </Pressable>
                )}

                {hiddenFile && (
                  <Pressable
                    onPress={() => setStep(2)}
                    style={[styles.nextBtn, { backgroundColor: activeTheme.primary }]}
                  >
                    <Text style={styles.nextBtnText}>Next Step</Text>
                    <ArrowRight size={20} color="#FFFFFF" />
                  </Pressable>
                )}
              </View>
            )}

            {/* Step 2: Select cover document */}
            {step === 2 && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Step 2: Select Cover File</Text>
                <Text style={[styles.stepDesc, { color: activeTheme.textSecondary }]}>
                  Choose a PDF document, Java source file, HTML page, or any other file to mask the content.
                </Text>

                {coverFile ? (
                  <GlassCard style={styles.previewCard}>
                    <View style={styles.docIconWrapper}>
                      <FileText size={50} color="#3B82F6" />
                    </View>
                    <Text numberOfLines={1} style={styles.selectedName}>
                      {coverFile.name}
                    </Text>
                    <Text style={[styles.selectedSize, { color: activeTheme.textSecondary }]}>
                      {formatBytes(coverFile.size)} • {coverFile.mimeType}
                    </Text>
                    <Pressable
                      onPress={handlePickCover}
                      style={[styles.actionBtn, { borderColor: activeTheme.borderColor }]}
                    >
                      <Text style={styles.actionBtnText}>Change Cover File</Text>
                    </Pressable>
                  </GlassCard>
                ) : (
                  <Pressable
                    onPress={handlePickCover}
                    style={({ pressed }) => [
                      styles.uploadTrigger,
                      { borderColor: activeTheme.borderColor, backgroundColor: pressed ? 'rgba(255, 255, 255, 0.02)' : 'transparent' },
                    ]}
                  >
                    <FileText size={48} color="#3B82F6" />
                    <Text style={styles.uploadTriggerText}>Select Document Cover</Text>
                    <Text style={[styles.uploadTriggerSub, { color: activeTheme.textSecondary }]}>
                      PDF, Java, JS, HTML, or Images
                    </Text>
                  </Pressable>
                )}

                <View style={styles.stepNavRow}>
                  <Pressable
                    onPress={() => setStep(1)}
                    style={[styles.backBtn, { borderColor: activeTheme.borderColor }]}
                  >
                    <ArrowLeft size={18} color="#FFFFFF" />
                    <Text style={styles.backBtnText}>Back</Text>
                  </Pressable>

                  {coverFile && (
                    <Pressable
                      onPress={() => setStep(3)}
                      style={[styles.nextBtn, { backgroundColor: activeTheme.primary }]}
                    >
                      <Text style={styles.nextBtnText}>Next Step</Text>
                      <ArrowRight size={20} color="#FFFFFF" />
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* Step 3: Final configuration & compile */}
            {step === 3 && (
              <View style={styles.stepContainer}>
                <Text style={styles.stepTitle}>Step 3: Compile Polyglot File</Text>
                <Text style={[styles.stepDesc, { color: activeTheme.textSecondary }]}>
                  Specify the filename for your compiled polyglot file. It must end with the cover file&apos;s extension to remain stealthy.
                </Text>

                <GlassCard style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Stitching Summary</Text>
                  
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: activeTheme.textSecondary }]}>Secret Media:</Text>
                    <Text numberOfLines={1} style={styles.summaryValue}>{hiddenFile?.name} ({formatBytes(hiddenFile?.size || 0)})</Text>
                  </View>
                  
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: activeTheme.textSecondary }]}>Cover Document:</Text>
                    <Text numberOfLines={1} style={styles.summaryValue}>{coverFile?.name} ({formatBytes(coverFile?.size || 0)})</Text>
                  </View>
                  
                  <View style={styles.summaryItem}>
                    <Text style={[styles.summaryLabel, { color: activeTheme.textSecondary }]}>Output Mask Format:</Text>
                    <Text style={[styles.summaryValue, { fontWeight: '700', color: activeTheme.primary }]}>
                      {coverFile?.name.split('.').pop()?.toUpperCase()} Polyglot
                    </Text>
                  </View>
                </GlassCard>

                <View style={styles.inputContainer}>
                  <Text style={[styles.inputLabel, { color: activeTheme.textSecondary }]}>Output Filename</Text>
                  <TextInput
                    value={outputName}
                    onChangeText={setOutputName}
                    placeholder="example.pdf"
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    style={[styles.textInput, { borderColor: activeTheme.borderColor }]}
                  />
                </View>

                <View style={styles.stepNavRow}>
                  <Pressable
                    onPress={() => setStep(2)}
                    disabled={loading}
                    style={[styles.backBtn, { borderColor: activeTheme.borderColor }]}
                  >
                    <ArrowLeft size={18} color="#FFFFFF" />
                    <Text style={styles.backBtnText}>Back</Text>
                  </Pressable>

                  <Pressable
                    onPress={handleCompile}
                    disabled={loading}
                    style={[styles.nextBtn, { backgroundColor: activeTheme.primary, minWidth: 120 }]}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <>
                        <Text style={styles.nextBtnText}>Compile & Save</Text>
                        <ArrowRight size={20} color="#FFFFFF" />
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            )}

            {/* Step 4: Success confirmation */}
            {step === 4 && (
              <View style={styles.successContainer}>
                <CheckCircle size={80} color={activeTheme.success} style={styles.successIcon} />
                <Text style={styles.successTitle}>Polyglot Compiled!</Text>
                <Text style={[styles.successText, { color: activeTheme.textSecondary }]}>
                  Your file &quot;{outputName}&quot; has been stitched and saved securely in your vault space.
                </Text>
                <Text style={[styles.successTextHint, { color: activeTheme.textSecondary }]}>
                  If exported, this file will appear and parse as a standard cover file (like a normal document or code file), keeping your media perfectly safe.
                </Text>

                <Pressable
                  onPress={() => {
                    onSuccess();
                    handleClose();
                  }}
                  style={[styles.doneBtn, { backgroundColor: activeTheme.success }]}
                >
                  <Text style={styles.doneBtnText}>Go to Vault</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '90%',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  stepIndicatorWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  stepLine: {
    width: 50,
    height: 2,
    marginHorizontal: 4,
  },
  scrollContent: {
    flexGrow: 1,
  },
  stepContainer: {
    flex: 1,
  },
  stepTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  uploadTrigger: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  uploadTriggerText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 14,
  },
  uploadTriggerSub: {
    fontSize: 12,
    marginTop: 4,
  },
  previewCard: {
    alignItems: 'center',
    padding: 20,
    marginVertical: 10,
  },
  mediaPreview: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 14,
  },
  videoPreviewFallback: {
    width: 120,
    height: 120,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  videoPreviewText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
  },
  docIconWrapper: {
    width: 100,
    height: 100,
    borderRadius: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  selectedName: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    width: '90%',
  },
  selectedSize: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  actionBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    height: 48,
    marginTop: 30,
    paddingHorizontal: 20,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 20,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  stepNavRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  summaryCard: {
    padding: 16,
    marginVertical: 10,
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  summaryLabel: {
    fontSize: 13,
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
    maxWidth: '60%',
  },
  inputContainer: {
    marginTop: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1.5,
    borderRadius: 12,
    height: 48,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 15,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 10,
  },
  successIcon: {
    marginBottom: 20,
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  successText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 10,
  },
  successTextHint: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    opacity: 0.8,
    marginBottom: 30,
  },
  doneBtn: {
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
