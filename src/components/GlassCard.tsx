import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useVault } from '../services/vaultState';

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const GlassCard: React.FC<GlassCardProps> = ({ children, style }) => {
  const { activeTheme } = useVault();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: activeTheme.cardBackground,
          borderColor: activeTheme.borderColor,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5,
    overflow: 'hidden',
  },
});
