import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, Modal, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import { 
  ArrowLeft, 
  Trash2, 
  Check, 
  Plus, 
  Key, 
  Lock,
  Palette,
  Download,
  Upload
} from 'lucide-react-native';
import { useVault } from '../../services/vaultState';
import { Themes, ThemeId } from '../../services/theme';
import { GlassCard } from '../../components/GlassCard';

export default function SettingsScreen() {
  const router = useRouter();
  const { 
    spaces, 
    activeSpace, 
    activeTheme, 
    calculatorThemeId,
    updateSpacePassword, 
    updateSpaceTheme, 
    updateCalculatorTheme,
    createNewSpace, 
    deleteSpace,
    lockVault,
    backupVault,
    restoreVault
  } = useVault();

  const isSimpleMode = activeSpace?.mode === 'simple';

  // Backup & Restore State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingText, setProcessingText] = useState('');

  // New Space Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newThemeId, setNewThemeId] = useState<ThemeId>('cyberNeon');

  // Editing Space Passwords
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [editingPassword, setEditingPassword] = useState('');

  const handleBack = () => {
    if (activeSpace) {
      router.replace(`/vault/${activeSpace.id}`);
    } else {
      router.replace('/');
    }
  };

  const handleLock = () => {
    lockVault();
    router.replace('/');
  };

  const handleStartEditPassword = (spaceId: string, currentPass: string) => {
    setEditingSpaceId(spaceId);
    setEditingPassword(currentPass);
  };

  const handleSavePassword = async (spaceId: string) => {
    if (!editingPassword.trim()) {
      Alert.alert('Validation Error', 'Password formula cannot be empty.');
      return;
    }

    const success = await updateSpacePassword(spaceId, editingPassword.trim());
    if (success) {
      setEditingSpaceId(null);
      Alert.alert('Saved', 'Vault password formula updated successfully.');
    } else {
      Alert.alert('Conflict', 'This password formula is already used by another vault space.');
    }
  };

  const handleThemeChange = async (spaceId: string, themeId: string) => {
    await updateSpaceTheme(spaceId, themeId);
  };

  const handleDeleteSpace = (spaceId: string, spaceName: string) => {
    if (spaces.length <= 1) {
      Alert.alert('Action Restricted', 'You must keep at least one vault space. Create another space first before deleting this one.');
      return;
    }

    Alert.alert(
      'Delete Vault Space',
      `WARNING: Deleting "${spaceName}" will permanently destroy this space and ALL files inside it. This action cannot be undone. Are you sure you want to proceed?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Permanently Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const isDeletingActive = activeSpace?.id === spaceId;
              await deleteSpace(spaceId);
              Alert.alert('Deleted', 'Vault space deleted.');
              if (isDeletingActive) {
                router.replace('/');
              }
            } catch (err: any) {
              Alert.alert('Error', err.message || 'Failed to delete space.');
            }
          }
        }
      ]
    );
  };

  const handleCreateSpace = async () => {
    if (!newName.trim() || !newPassword.trim()) {
      Alert.alert('Validation Error', 'Please specify a name and password formula.');
      return;
    }

    // Check conflict
    const cleanPass = newPassword.trim().replace(/\s+/g, '');
    const conflict = spaces.some(s => s.passwordFormula.replace(/\s+/g, '') === cleanPass);
    if (conflict) {
      Alert.alert('Conflict', 'This password formula is already in use by another space. Choose a different equation.');
      return;
    }

    await createNewSpace(newName.trim(), newPassword.trim(), newThemeId);
    setShowAddModal(false);
    setNewName('');
    setNewPassword('');
    setNewThemeId('cyberNeon');
    Alert.alert('Success', 'New secure vault space created successfully!');
  };

  const handleBackup = async () => {
    setIsProcessing(true);
    setProcessingText('Creating backup...');
    try {
      const success = await backupVault();
      if (success) {
        Alert.alert('Backup Created', 'Your backup file has been successfully shared or saved.');
      } else {
        Alert.alert('Backup Failed', 'An error occurred while creating the backup.');
      }
    } catch (err: any) {
      Alert.alert('Backup Error', err.message || 'An error occurred.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const pickedFile = result.assets[0];

      setIsProcessing(true);
      setProcessingText('Reading backup file...');
      const content = await FileSystem.readAsStringAsync(pickedFile.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      let backupObj: any;
      try {
        backupObj = JSON.parse(content);
      } catch {
        Alert.alert('Invalid File', 'The selected file is not a valid JSON document.');
        setIsProcessing(false);
        return;
      }

      if (!backupObj.version || !backupObj.spaces || !backupObj.metadata || !Array.isArray(backupObj.files)) {
        Alert.alert('Invalid Format', 'This file does not appear to be a valid Calculator Vault backup.');
        setIsProcessing(false);
        return;
      }

      setIsProcessing(false);

      Alert.alert(
        'Restore Option',
        'How would you like to restore this backup?\n\n' +
        '• Merge: Add backup vaults/files to your current ones (avoids deleting data).\n' +
        '• Replace: WIPE all current vaults/files and replace them exactly with the backup.',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Merge Data', 
            onPress: () => executeRestore(backupObj, 'merge') 
          },
          { 
            text: 'Replace Everything', 
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Wipe & Replace',
                'WARNING: This will permanently delete all your current vaults, passwords, and files. This cannot be undone. Are you sure you want to proceed?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { 
                    text: 'Yes, Wipe & Replace', 
                    style: 'destructive',
                    onPress: () => executeRestore(backupObj, 'replace') 
                  }
                ]
              );
            }
          }
        ]
      );
    } catch (err: any) {
      Alert.alert('Restore Failed', err.message || 'An error occurred during restore.');
      setIsProcessing(false);
    }
  };

  const executeRestore = async (backupObj: any, strategy: 'merge' | 'replace') => {
    setIsProcessing(true);
    setProcessingText('Restoring vaults...');
    try {
      const result = await restoreVault(backupObj, strategy);
      setIsProcessing(false);
      if (result.success) {
        Alert.alert(
          'Restore Complete',
          'Vaults restored successfully! The app will now lock for security.',
          [
            {
              text: 'OK',
              onPress: () => router.replace('/')
            }
          ]
        );
      } else {
        Alert.alert('Restore Failed', result.message);
      }
    } catch (err: any) {
      setIsProcessing(false);
      Alert.alert('Restore Error', err.message || 'An error occurred.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: activeTheme.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <ArrowLeft size={22} color="#FFFFFF" />
        </Pressable>
        <Text style={styles.headerTitle}>Vault Configurations</Text>
        <Pressable onPress={handleLock} style={styles.lockBtn}>
          <Lock size={20} color={activeTheme.primary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Spaces Settings Section */}
        {!isSimpleMode && (
          <>
            <Text style={[styles.sectionTitle, { color: activeTheme.primary }]}>Vault Spaces</Text>
            
            {spaces.map((space) => {
              const isActive = activeSpace?.id === space.id;
              
              return (
                <GlassCard key={space.id} style={[styles.spaceCard, isActive && { borderColor: activeTheme.primary }]}>
                  {/* Top Row: Info & Delete */}
                  <View style={styles.spaceCardHeader}>
                    <View>
                      <View style={styles.spaceTitleRow}>
                        <Text style={styles.spaceName}>{space.name}</Text>
                        {isActive && (
                          <View style={[styles.activeBadge, { backgroundColor: `${activeTheme.primary}20` }]}>
                            <Text style={[styles.activeBadgeText, { color: activeTheme.primary }]}>Active</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.spaceIdText, { color: activeTheme.textSecondary }]}>ID: {space.id}</Text>
                    </View>
                    
                    <Pressable 
                      onPress={() => handleDeleteSpace(space.id, space.name)}
                      style={styles.deleteBtn}
                    >
                      <Trash2 size={18} color="#EF4444" />
                    </Pressable>
                  </View>

                  <View style={[styles.divider, { backgroundColor: activeTheme.borderColor }]} />

                  {/* Password Setting Row */}
                  <View style={styles.settingRow}>
                    <View style={styles.settingLabelWrapper}>
                      <Key size={16} color={activeTheme.textSecondary} style={styles.settingIcon} />
                      <Text style={styles.settingLabel}>Password Formula:</Text>
                    </View>
                    
                    {editingSpaceId === space.id ? (
                      <View style={styles.editingRow}>
                        <TextInput
                          value={editingPassword}
                          onChangeText={setEditingPassword}
                          placeholder="e.g. 12+34"
                          placeholderTextColor="rgba(255,255,255,0.3)"
                          style={[styles.editingInput, { borderColor: activeTheme.primary }]}
                        />
                        <Pressable 
                          onPress={() => handleSavePassword(space.id)}
                          style={[styles.saveBtn, { backgroundColor: activeTheme.primary }]}
                        >
                          <Check size={16} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable 
                        onPress={() => handleStartEditPassword(space.id, space.passwordFormula)}
                        style={styles.clickableValue}
                      >
                        <Text style={[styles.valueText, { color: activeTheme.primary }]}>
                          {space.passwordFormula} =
                        </Text>
                        <Text style={[styles.tapToEdit, { color: activeTheme.textSecondary }]}>Tap to edit</Text>
                      </Pressable>
                    )}
                  </View>

                  {/* Theme Settings Row */}
                  <View style={styles.settingColumn}>
                    <View style={styles.settingLabelWrapper}>
                      <Palette size={16} color={activeTheme.textSecondary} style={styles.settingIcon} />
                      <Text style={styles.settingLabel}>Space Theme:</Text>
                    </View>
                    
                    <View style={styles.themesRow}>
                      {Object.keys(Themes).map((tId) => {
                        const themeObj = Themes[tId];
                        const isSelected = space.themeId === tId;
                        return (
                          <Pressable
                            key={tId}
                            onPress={() => handleThemeChange(space.id, tId)}
                            style={[
                              styles.themeOptionBtn,
                              { 
                                backgroundColor: isSelected ? themeObj.primary : 'rgba(255,255,255,0.05)',
                                borderColor: themeObj.primary,
                                borderWidth: isSelected ? 1.5 : 0.5
                              }
                            ]}
                          >
                            <Text style={[
                              styles.themeOptionText, 
                              { color: isSelected ? '#FFFFFF' : themeObj.primary }
                            ]}>
                              {themeObj.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </GlassCard>
              );
            })}

            {/* Create Space Button CTA */}
            <Pressable 
              onPress={() => setShowAddModal(true)}
              style={({ pressed }) => [
                styles.addSpaceBtn,
                { backgroundColor: activeTheme.primary },
                pressed && styles.buttonPressed
              ]}
            >
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.addSpaceBtnText}>Create New Vault Space</Text>
            </Pressable>
          </>
        )}

        {/* Calculator Customization */}
        <Text style={[styles.sectionTitle, { color: activeTheme.primary, marginTop: isSimpleMode ? 0 : 24 }]}>Calculator Theme</Text>
        <GlassCard style={[styles.backupCard, { marginBottom: 24 }]}>
          <Text style={[styles.backupTitle, { color: '#FFFFFF' }]}>Calculator Interface Theme</Text>
          <Text style={[styles.backupDesc, { color: activeTheme.textSecondary }]}>
            Choose the theme for the main calculator screen interface.
          </Text>
          
          <View style={styles.themesRow}>
            {Object.keys(Themes).map((tId) => {
              const themeObj = Themes[tId];
              const isSelected = calculatorThemeId === tId;
              return (
                <Pressable
                  key={tId}
                  onPress={() => updateCalculatorTheme(tId)}
                  style={[
                    styles.themeOptionBtn,
                    { 
                      backgroundColor: isSelected ? themeObj.primary : 'rgba(255,255,255,0.05)',
                      borderColor: themeObj.primary,
                      borderWidth: isSelected ? 1.5 : 0.5
                    }
                  ]}
                >
                  <Text style={[
                    styles.themeOptionText, 
                    { color: isSelected ? '#FFFFFF' : themeObj.primary }
                  ]}>
                    {themeObj.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </GlassCard>

        {/* Backup & Restore Section */}
        <Text style={[styles.sectionTitle, { color: activeTheme.primary, marginTop: 24 }]}>Backup & Recovery</Text>
        <GlassCard style={styles.backupCard}>
          <Text style={[styles.backupTitle, { color: '#FFFFFF' }]}>Data Portability</Text>
          <Text style={[styles.backupDesc, { color: activeTheme.textSecondary }]}>
            Backup your vaults to a secure JSON file, or restore them from a previous backup. This allows you to migrate your data or prevent loss when uninstalling.
          </Text>
          
          <View style={styles.backupBtnRow}>
            <Pressable 
              onPress={handleBackup}
              style={({ pressed }) => [
                styles.backupActionBtn, 
                { borderColor: activeTheme.primary, borderWidth: 1.5 },
                pressed && styles.buttonPressed
              ]}
            >
              <Download size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.backupActionText, { color: activeTheme.primary }]}>Backup Vaults</Text>
            </Pressable>
            
            <Pressable 
              onPress={handleRestore}
              style={({ pressed }) => [
                styles.backupActionBtn, 
                { borderColor: activeTheme.primary, borderWidth: 1.5 },
                pressed && styles.buttonPressed
              ]}
            >
              <Upload size={16} color={activeTheme.primary} style={{ marginRight: 6 }} />
              <Text style={[styles.backupActionText, { color: activeTheme.primary }]}>Restore Backup</Text>
            </Pressable>
          </View>
        </GlassCard>
      </ScrollView>

      {/* Modal: Create Space */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showAddModal}
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: activeTheme.background }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Vault Space</Text>
              <Pressable onPress={() => setShowAddModal(false)} style={styles.closeBtn}>
                <Check size={20} color="#FFFFFF" />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalForm}>
              {/* Form Input: Name */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: activeTheme.textSecondary }]}>Vault Name</Text>
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="e.g. Secure Files"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={[styles.textInput, { borderColor: activeTheme.borderColor }]}
                />
              </View>

              {/* Form Input: Password Formula */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: activeTheme.textSecondary }]}>Calculator Password Formula</Text>
                <Text style={[styles.inputHint, { color: activeTheme.textSecondary }]}>
                  This is the equation you type into the calculator (followed by {"="}) to unlock this space.
                </Text>
                <TextInput
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="e.g. 5+5 or 1234"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  style={[styles.textInput, { borderColor: activeTheme.borderColor }]}
                />
              </View>

              {/* Form Input: Theme Select */}
              <View style={styles.inputContainer}>
                <Text style={[styles.inputLabel, { color: activeTheme.textSecondary }]}>Vault Theme</Text>
                <View style={styles.themeSelectGrid}>
                  {Object.keys(Themes).map((tId) => {
                    const themeObj = Themes[tId];
                    const isSelected = newThemeId === tId;
                    return (
                      <Pressable
                        key={tId}
                        onPress={() => setNewThemeId(tId as ThemeId)}
                        style={[
                          styles.themeSelectCard,
                          { 
                            backgroundColor: themeObj.background,
                            borderColor: isSelected ? themeObj.primary : 'rgba(255,255,255,0.1)',
                            borderWidth: isSelected ? 2 : 1
                          }
                        ]}
                      >
                        <Text style={[styles.themeSelectCardName, { color: '#FFFFFF' }]}>
                          {themeObj.name}
                        </Text>
                        <View style={styles.themeColorIndicators}>
                          <View style={[styles.indicatorDot, { backgroundColor: themeObj.primary }]} />
                          <View style={[styles.indicatorDot, { backgroundColor: themeObj.accentGradient[0] }]} />
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Save Button */}
              <Pressable
                onPress={handleCreateSpace}
                style={[styles.modalSubmitBtn, { backgroundColor: activeTheme.primary }]}
              >
                <Text style={styles.modalSubmitBtnText}>Create Vault Space</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Processing Overlay */}
      {isProcessing && (
        <View style={styles.processingOverlay}>
          <GlassCard style={styles.processingCard}>
            <ActivityIndicator size="large" color={activeTheme.primary} />
            <Text style={styles.processingText}>{processingText}</Text>
          </GlassCard>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  lockBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  spaceCard: {
    marginBottom: 16,
  },
  spaceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  spaceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginLeft: 8,
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  spaceIdText: {
    fontSize: 11,
    marginTop: 2,
  },
  deleteBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  settingColumn: {
    paddingVertical: 4,
    marginTop: 10,
  },
  settingLabelWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  settingIcon: {
    marginRight: 6,
  },
  settingLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  clickableValue: {
    alignItems: 'flex-end',
  },
  valueText: {
    fontSize: 15,
    fontWeight: '700',
  },
  tapToEdit: {
    fontSize: 10,
    marginTop: 2,
  },
  editingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editingInput: {
    borderWidth: 1,
    borderRadius: 6,
    height: 34,
    width: 100,
    color: '#FFFFFF',
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginRight: 6,
  },
  saveBtn: {
    width: 34,
    height: 34,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  themeOptionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  themeOptionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  addSpaceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    marginTop: 14,
  },
  addSpaceBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalForm: {
    paddingBottom: 30,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  inputHint: {
    fontSize: 11,
    lineHeight: 16,
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
  themeSelectGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  themeSelectCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  themeSelectCardName: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  themeColorIndicators: {
    flexDirection: 'row',
  },
  indicatorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 3,
  },
  modalSubmitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    marginTop: 10,
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backupCard: {
    marginBottom: 16,
    padding: 16,
  },
  backupTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  backupDesc: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  backupBtnRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  backupActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
    borderRadius: 10,
    marginHorizontal: 4,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  backupActionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  processingCard: {
    padding: 30,
    alignItems: 'center',
    justifyContent: 'center',
    width: '80%',
  },
  processingText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 15,
    textAlign: 'center',
  },
});
