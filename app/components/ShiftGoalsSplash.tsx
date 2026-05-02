import { useRef, useEffect } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
} from 'react-native';

const BG = '#09100e';
const BLUE = '#4169E1';
const BLUE_DIM = 'rgba(65, 105, 225, 0.18)';
const MUTED = '#4a5e56';
const CARD = '#162019';
const BORDER = '#1e3028';

export type ShiftGoal = {
  id: string;
  title: string;
  goal_type: 'top_sales' | 'most_upsells' | 'specific_item' | 'managers_choice';
  target_item?: string | null;
};

const GOAL_ICONS: Record<string, string> = {
  top_sales: '💰',
  most_upsells: '📈',
  specific_item: '🎯',
  managers_choice: '⭐',
};

const GOAL_LABELS: Record<string, string> = {
  top_sales: 'Top Sales',
  most_upsells: 'Most Upsells',
  specific_item: 'Special Item',
  managers_choice: "Manager's Choice",
};

type Props = {
  goals: ShiftGoal[];
  onDismiss: () => void;
};

export default function ShiftGoalsSplash({ goals, onDismiss }: Props) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Logo */}
      <View style={styles.logoRow}>
        <Text style={styles.logoEmoji}>💸</Text>
        <Text style={styles.logoText}>Mise</Text>
      </View>

      {/* Title block */}
      <View style={styles.titleBlock}>
        <Text style={styles.categoryLabel}>TONIGHT'S GOALS</Text>
        <Text style={styles.headingText}>
          {goals.length === 1 ? '1 goal set' : `${goals.length} goals set`} for your shift
        </Text>
        <View style={styles.titleLine} />
      </View>

      {/* Goals list */}
      <ScrollView
        style={styles.goalsList}
        contentContainerStyle={styles.goalsContent}
        showsVerticalScrollIndicator={false}>
        {goals.map((goal, i) => (
          <View key={goal.id} style={[styles.goalCard, i < goals.length - 1 && styles.goalCardBorder]}>
            <View style={styles.goalIconWrap}>
              <Text style={styles.goalIcon}>{GOAL_ICONS[goal.goal_type] ?? '🎯'}</Text>
            </View>
            <View style={styles.goalText}>
              <Text style={styles.goalType}>{GOAL_LABELS[goal.goal_type] ?? goal.goal_type}</Text>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              {goal.target_item ? (
                <Text style={styles.goalItem}>Item: {goal.target_item}</Text>
              ) : null}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Dismiss button */}
      <Pressable style={styles.dismissBtn} onPress={onDismiss}>
        <Text style={styles.dismissBtnText}>Let's go! 🚀</Text>
      </Pressable>
    </Animated.View>
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
    color: BLUE,
    letterSpacing: -0.3,
  },
  titleBlock: {
    width: '100%',
    alignItems: 'flex-start',
    gap: 14,
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
  headingText: {
    fontSize: 26,
    fontWeight: '300',
    color: '#ffffff',
    lineHeight: 36,
    letterSpacing: 0.2,
  },
  titleLine: {
    height: 2,
    width: '100%',
    backgroundColor: BLUE,
    borderRadius: 1,
  },
  goalsList: {
    width: '100%',
    flex: 1,
    marginVertical: 24,
  },
  goalsContent: {
    gap: 0,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: 'hidden',
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  goalCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  goalIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BLUE_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalIcon: {
    fontSize: 20,
  },
  goalText: {
    flex: 1,
    gap: 3,
  },
  goalType: {
    fontSize: 11,
    fontWeight: '700',
    color: BLUE,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  goalTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#e8f5ef',
    lineHeight: 21,
  },
  goalItem: {
    fontSize: 13,
    color: MUTED,
    fontWeight: '500',
  },
  dismissBtn: {
    width: '100%',
    backgroundColor: BLUE,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  dismissBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
});
