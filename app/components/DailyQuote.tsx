import { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { getDailyQuote, Quote } from '../../lib/quotes';

const BG = '#09100e';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65, 105, 225, 0.18)';
const MUTED = '#4a5e56';

type Props = {
  role: 'manager' | 'staff';
  onDismiss: () => void;
};

const DailyQuote = memo(function DailyQuote({ role, onDismiss }: Props) {
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

        {/* TOP — wordmark + tagline */}
        <View style={styles.topBlock}>
          <Text style={styles.logoText}>Mise</Text>
          <Text style={styles.taglineMise}>Everything in its Place.</Text>
        </View>

        {/* CENTER — quote block */}
        <View style={styles.quoteBlock}>
          <Text style={styles.categoryLabel}>{label}</Text>

          <Text style={styles.quoteText}>{quote?.text ?? ''}</Text>

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

        {/* BOTTOM — dismiss hint */}
        <Text style={styles.hint}>Tap anywhere to continue →</Text>

      </Animated.View>
    </TouchableWithoutFeedback>
  );
});

export default DailyQuote;

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
  topBlock: {
    alignItems: 'center',
    gap: 6,
  },
  logoText: {
    fontSize: 48,
    fontWeight: '800',
    color: BLUE,
    letterSpacing: -1,
  },
  quoteBlock: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 20,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    backgroundColor: BLUE_DIM,
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
    backgroundColor: BLUE,
    borderRadius: 1,
  },
  author: {
    fontSize: 15,
    color: BLUE,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  taglineMise: {
    fontSize: 15,
    color: BLUE,
    letterSpacing: 0.5,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  hint: {
    fontSize: 16,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});
