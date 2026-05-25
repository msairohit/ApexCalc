import React, { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useVault } from '../services/vaultState';
import { CalculatorButton } from '../components/CalculatorButton';


export default function CalculatorScreen() {
  const router = useRouter();
  const { unlockSpace, activeTheme } = useVault();
  const [formula, setFormula] = useState('');
  const [displayValue, setDisplayValue] = useState('0');
  const [isEvaluated, setIsEvaluated] = useState(false);

  // Dynamic theme persisted in settings
  const calcTheme = activeTheme;

  const handleKeyPress = (char: string) => {
    if (isEvaluated) {
      if (['+', '-', '*', '/'].includes(char)) {
        setFormula(displayValue + char);
        setIsEvaluated(false);
        return;
      } else {
        setFormula(char);
        setIsEvaluated(false);
        return;
      }
    }

    // Limit length to avoid layout overflow
    if (formula.length > 15) return;

    setFormula((prev) => prev + char);
  };

  const handleClear = () => {
    setFormula('');
    setDisplayValue('0');
    setIsEvaluated(false);
  };

  const handleDelete = () => {
    if (isEvaluated) {
      handleClear();
      return;
    }
    setFormula((prev) => prev.slice(0, -1));
  };

  const evaluateExpression = (expr: string): string => {
    try {
      const sanitized = expr.replace(/[^0-9+\-*/.%]/g, '');
      if (!sanitized) return '0';
      
      let parsedExpr = sanitized.replace(/%/g, '/100');
      
      // Calculate using Function constructor
      const result = new Function(`return ${parsedExpr}`)();
      if (result === undefined || isNaN(result)) return 'Error';
      
      if (typeof result === 'number' && !Number.isInteger(result)) {
        return parseFloat(result.toFixed(6)).toString();
      }
      return result.toString();
    } catch {
      return 'Error';
    }
  };

  const handleEqual = async () => {
    if (!formula) return;

    // Check if formula matches any secret vault credentials
    const unlockedSpace = await unlockSpace(formula);
    if (unlockedSpace) {
      // Clear inputs for secrecy, and route to Vault Dashboard
      setFormula('');
      setDisplayValue('0');
      setIsEvaluated(false);
      router.push(`/vault/${unlockedSpace.id}`);
      return;
    }

    // Standard Math evaluation
    const result = evaluateExpression(formula);
    setDisplayValue(result);
    setIsEvaluated(true);
  };

  // Format the formula display to look standard
  const getFormattedFormula = () => {
    if (!formula) return '';
    return formula
      .replace(/\*/g, ' × ')
      .replace(/\//g, ' ÷ ')
      .replace(/\+/g, ' + ')
      .replace(/-/g, ' - ');
  };

  return (
    <View style={[styles.container, { backgroundColor: calcTheme.background }]}>
      <StatusBar style="light" />
      
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.innerContainer}
      >
        {/* Glowing Display */}
        <View style={styles.displayContainer}>
          <Text style={[styles.historyText, { color: calcTheme.textSecondary }]}>
            {getFormattedFormula()}
          </Text>
          <View style={[styles.mainDisplayWrapper, { 
            backgroundColor: calcTheme.calculatorDisplayBg,
            borderColor: calcTheme.borderColor,
            shadowColor: calcTheme.primary,
          }]}>
            <Text 
              numberOfLines={1} 
              adjustsFontSizeToFit 
              style={[styles.displayValue, { color: '#FFFFFF' }]}
            >
              {isEvaluated ? displayValue : formula || '0'}
            </Text>
          </View>
        </View>

        {/* Buttons Grid */}
        <View style={styles.keypadContainer}>
          {/* Row 1 */}
          <View style={styles.row}>
            <CalculatorButton label="C" onPress={handleClear} type="action" />
            <CalculatorButton label="⌫" onPress={handleDelete} type="action" />
            <CalculatorButton label="%" onPress={() => handleKeyPress('%')} type="action" />
            <CalculatorButton label="÷" onPress={() => handleKeyPress('/')} type="operator" />
          </View>

          {/* Row 2 */}
          <View style={styles.row}>
            <CalculatorButton label="7" onPress={() => handleKeyPress('7')} />
            <CalculatorButton label="8" onPress={() => handleKeyPress('8')} />
            <CalculatorButton label="9" onPress={() => handleKeyPress('9')} />
            <CalculatorButton label="×" onPress={() => handleKeyPress('*')} type="operator" />
          </View>

          {/* Row 3 */}
          <View style={styles.row}>
            <CalculatorButton label="4" onPress={() => handleKeyPress('4')} />
            <CalculatorButton label="5" onPress={() => handleKeyPress('5')} />
            <CalculatorButton label="6" onPress={() => handleKeyPress('6')} />
            <CalculatorButton label="-" onPress={() => handleKeyPress('-')} type="operator" />
          </View>

          {/* Row 4 */}
          <View style={styles.row}>
            <CalculatorButton label="1" onPress={() => handleKeyPress('1')} />
            <CalculatorButton label="2" onPress={() => handleKeyPress('2')} />
            <CalculatorButton label="3" onPress={() => handleKeyPress('3')} />
            <CalculatorButton label="+" onPress={() => handleKeyPress('+')} type="operator" />
          </View>

          {/* Row 5 */}
          <View style={styles.row}>
            <CalculatorButton label="0" onPress={() => handleKeyPress('0')} isDoubleWidth />
            <CalculatorButton label="." onPress={() => handleKeyPress('.')} />
            <CalculatorButton label="=" onPress={handleEqual} type="equal" />
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 25,
  },
  displayContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    flex: 1,
  },
  historyText: {
    fontSize: 20,
    minHeight: 26,
    fontFamily: 'System',
    marginBottom: 8,
    textAlign: 'right',
  },
  mainDisplayWrapper: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1.5,
    paddingVertical: 20,
    paddingHorizontal: 24,
    minHeight: 100,
    justifyContent: 'center',
    alignItems: 'flex-end',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  displayValue: {
    fontSize: 54,
    fontWeight: '300',
    fontFamily: 'System',
    textAlign: 'right',
  },
  keypadContainer: {
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 2,
  },
});
