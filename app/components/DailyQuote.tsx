import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { getDailyQuote, Quote } from '../../lib/quotes';

const BG = '#09100e';
const TEAL = '#00e5a0';
const TEAL_DIM = 'rgba(0,229,160,0.18)';
const MUTED = '#4a5e56';

type Props = {
  role: 'manager' | 'staff';
  onDismiss: () => void;
};

export default function DailyQuote({ role, onDismiss }: Props) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const label = role === 'staff' ? "TODAY'S INTENTION" : 'LEAD WITH THIS TODAY';

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const lineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getDailyQuote(role).then(setQuote);
  }, [role]);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(lineAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: false,
      }),
    ]).start();
  }, []);

  return (
    <TouchableWithoutFeedback onPress={onDismiss}>
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <Text style={styles.logoEmoji}>💸</Text>
          <Text style={styles.logoText}>TipFlow</Text>
        </View>

        {/* Quote block */}
        <View style={styles.quoteBlock}>
          <Text style={styles.categoryLabel}>{label}</Text>

          <Text style={styles.quoteText}>{quote?.text ?? ''}</Text>

          {/* Animated teal underline */}
          <Animated.View
            style={[
              styles.line,
              {
                width: lineAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />

          {quote?.author ? (
            <Text style={styles.author}>— {quote.author}</Text>
          ) : null}
        </View>

        {/* Dismiss hint */}
        <Text style={styles.hint}>Tap anywhere to continue →</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
    paddingHorizontal: 32,
    paddingTop: 60,
    paddingBottom: 48,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoEmoji: {
    fontSize: 22,
  },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: TEAL,
    letterSpacing: -0.3,
  },
  quoteBlock: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 20,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: TEAL,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    backgroundColor: TEAL_DIM,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  quoteText: {
    fontSize: 26,
    fontWeight: '300',
    color: '#ffffff',
    lineHeight: 40,
    letterSpacing: 0.2,
    textAlign: 'left',
  },
  line: {
    height: 2,
    backgroundColor: TEAL,
    borderRadius: 1,
  },
  author: {
    fontSize: 15,
    color: TEAL,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 13,
    color: MUTED,
    letterSpacing: 0.5,
  },
});
