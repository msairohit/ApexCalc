import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, Animated, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVault } from '../services/vaultState';

interface CalculatorButtonProps {
  label: string;
  onPress: () => void;
  isDoubleWidth?: boolean;
  type?: 'number' | 'operator' | 'action' | 'equal';
  style?: ViewStyle;
}

export const CalculatorButton: React.FC<CalculatorButtonProps> = ({
  label,
  onPress,
  isDoubleWidth = false,
  type = 'number',
  style,
}) => {
  const { activeTheme } = useVault();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.92,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  // Determine colors based on button type
  let bgColors: [string, string];
  let textColor = '#FFFFFF';

  if (type === 'equal') {
    bgColors = activeTheme.primaryGradient;
    textColor = '#FFFFFF';
  } else if (type === 'operator') {
    bgColors = activeTheme.accentGradient;
    textColor = '#FFFFFF';
  } else if (type === 'action') {
    bgColors = ['rgba(255, 255, 255, 0.08)', 'rgba(255, 255, 255, 0.03)'];
    textColor = activeTheme.primary;
  } else {
    // Number buttons
    bgColors = ['rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.02)'];
    textColor = '#FFFFFF';
  }

  return (
    <Animated.View
      style={[
        styles.container,
        isDoubleWidth && styles.doubleWidth,
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={({ pressed }) => [styles.pressable, isDoubleWidth && styles.doubleWidthPressable]}
      >
        <LinearGradient
          colors={bgColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <Text style={[styles.text, { color: textColor }, type === 'operator' && styles.operatorText]}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 75,
    height: 75,
    borderRadius: 37.5,
    overflow: 'hidden',
    margin: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  doubleWidth: {
    width: 162, // 75 * 2 + 12 (margin)
    borderRadius: 37.5,
  },
  pressable: {
    flex: 1,
  },
  doubleWidthPressable: {
    borderRadius: 37.5,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 26,
    fontWeight: '600',
    fontFamily: 'System',
  },
  operatorText: {
    fontSize: 28,
    fontWeight: '700',
  },
});
