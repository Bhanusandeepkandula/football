import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable, Switch, Alert, Platform, Linking, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Settings, Check, PanelBottom, PanelTop, Bell } from 'lucide-react-native';
import { useColors } from '@/hooks/useColors';
import { useAccent, accentForeground, ACCENT_OPTIONS } from '@/hooks/useAccent';
import { useMatchNavStyle } from '@/hooks/useMatchNavStyle';
import { useMatchAlerts } from '@/hooks/useMatchAlerts';
import { useTheme, THEME_OPTIONS } from '@/hooks/useTheme';
import { ThemeId } from '@/constants/colors';
import { font, KICKER_SPACING } from '@/constants/typography';

export function SettingsButton() {
  const colors = useColors();
  const { accent, setAccent } = useAccent();
  const { theme, setTheme } = useTheme();
  const { setNavStyle, floatingNav } = useMatchNavStyle();
  const { enabled: alertsOn, setEnabled: setAlertsOn } = useMatchAlerts();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const onToggleAlerts = async (on: boolean) => {
    const result = await setAlertsOn(on);
    if (on && !result) {
      Alert.alert(
        'Notifications are off',
        'Enable notifications in Settings to get live match alerts.',
        [
          { text: 'Not now', style: 'cancel' },
          ...(Platform.OS === 'ios' ? [{ text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) }] : []),
        ],
      );
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        hitSlop={12}
        activeOpacity={0.8}
        style={[styles.gear, { backgroundColor: colors.secondary, borderColor: colors.hairline }]}
      >
        <Settings size={20} color={colors.foreground} strokeWidth={2.2} />
      </TouchableOpacity>

      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={() => setOpen(false)}>
          <Pressable
            style={[styles.sheet, { backgroundColor: colors.cardElevated, borderColor: colors.hairline, paddingBottom: 20 + insets.bottom, maxHeight: '90%' }]}
            onPress={() => {}}
          >
            <View style={[styles.handle, { backgroundColor: colors.muted }]} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            <Text style={[styles.kicker, { color: colors.primary }]}>APPEARANCE</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>Theme</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Choose a background style for the app.
            </Text>

            <View style={styles.themeRow}>
              {THEME_OPTIONS.map((opt) => {
                const selected = opt.id === theme;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    activeOpacity={0.85}
                    onPress={() => setTheme(opt.id as ThemeId)}
                    style={styles.themeOption}
                  >
                    <View
                      style={[
                        styles.themePreview,
                        {
                          backgroundColor: opt.preview,
                          borderColor: selected ? colors.primary : opt.previewBorder ?? colors.hairline,
                        },
                      ]}
                    >
                      {selected ? <Check size={18} color={opt.id === 'white' ? '#000000' : '#FFFFFF'} strokeWidth={3} /> : null}
                    </View>
                    <Text
                      style={[styles.themeName, { color: selected ? colors.foreground : colors.mutedForeground }]}
                    >
                      {opt.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.title, styles.sectionTitle, { color: colors.foreground }]}>Accent Colour</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Pick a highlight colour for the whole app.
            </Text>

            <View style={styles.grid}>
              {ACCENT_OPTIONS.map((opt) => {
                const selected = opt.value.toLowerCase() === accent.toLowerCase();
                return (
                  <TouchableOpacity
                    key={opt.value}
                    activeOpacity={0.85}
                    onPress={() => setAccent(opt.value)}
                    style={styles.swatchWrap}
                  >
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: opt.value, borderColor: selected ? colors.foreground : 'transparent' },
                      ]}
                    >
                      {selected ? <Check size={20} color={accentForeground(opt.value)} strokeWidth={3.2} /> : null}
                    </View>
                    <Text
                      style={[styles.swatchName, { color: selected ? colors.foreground : colors.mutedForeground }]}
                      numberOfLines={1}
                    >
                      {opt.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.kicker, styles.sectionKicker, { color: colors.primary }]}>MATCH CENTRE</Text>
            <Text style={[styles.title, styles.sectionTitle, { color: colors.foreground }]}>Tab Navigation</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Sticky tabs stay below the score when you scroll. Floating nav pins tabs to the bottom.
            </Text>

            <View style={[styles.toggleRow, { backgroundColor: colors.secondary, borderColor: colors.hairline }]}>
              <View style={styles.toggleCopy}>
                <View style={styles.toggleLabelRow}>
                  {floatingNav ? (
                    <PanelBottom size={16} color={colors.primary} strokeWidth={2.4} />
                  ) : (
                    <PanelTop size={16} color={colors.primary} strokeWidth={2.4} />
                  )}
                  <Text style={[styles.toggleTitle, { color: colors.foreground }]}>
                    {floatingNav ? 'Floating bottom nav' : 'Sticky tab bar'}
                  </Text>
                </View>
                <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
                  {floatingNav ? 'Tabs float above the bottom edge' : 'Tabs stick under the scorecard'}
                </Text>
              </View>
              <Switch
                value={floatingNav}
                onValueChange={(on) => setNavStyle(on ? 'floating' : 'sticky')}
                trackColor={{ false: colors.muted, true: colors.primary + '88' }}
                thumbColor={floatingNav ? colors.primary : colors.mutedForeground}
                ios_backgroundColor={colors.muted}
              />
            </View>

            <Text style={[styles.kicker, styles.sectionKicker, { color: colors.primary }]}>NOTIFICATIONS</Text>
            <Text style={[styles.title, styles.sectionTitle, { color: colors.foreground }]}>Match Alerts</Text>
            <Text style={[styles.sub, { color: colors.mutedForeground }]}>
              Get notified of goals, red cards, penalties, half-time and full-time for matches you’re watching.
            </Text>

            <View style={[styles.toggleRow, { backgroundColor: colors.secondary, borderColor: colors.hairline }]}>
              <View style={styles.toggleCopy}>
                <View style={styles.toggleLabelRow}>
                  <Bell size={16} color={colors.primary} strokeWidth={2.4} />
                  <Text style={[styles.toggleTitle, { color: colors.foreground }]}>Live match alerts</Text>
                </View>
                <Text style={[styles.toggleSub, { color: colors.mutedForeground }]}>
                  {alertsOn ? 'On — goals, cards & penalties' : 'Off'}
                </Text>
              </View>
              <Switch
                value={alertsOn}
                onValueChange={onToggleAlerts}
                trackColor={{ false: colors.muted, true: colors.primary + '88' }}
                thumbColor={alertsOn ? colors.primary : colors.mutedForeground}
                ios_backgroundColor={colors.muted}
              />
            </View>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setOpen(false)}
              style={[styles.doneBtn, { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.doneText, { color: colors.primaryForeground }]}>Done</Text>
            </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gear: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 999,
    marginBottom: 14,
  },
  kicker: { fontSize: 12, fontFamily: font.displaySemi, letterSpacing: KICKER_SPACING },
  title: { fontSize: 24, fontFamily: font.displayBold, letterSpacing: -0.3, marginTop: 4 },
  sub: { fontSize: 13, fontFamily: font.medium, marginTop: 4, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  swatchWrap: { width: '18%', alignItems: 'center', gap: 6 },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  swatchName: { fontSize: 11, fontFamily: font.semibold },
  themeRow: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  themeOption: { flex: 1, alignItems: 'center', gap: 8 },
  themePreview: {
    width: '100%',
    aspectRatio: 1.35,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
  },
  themeName: { fontSize: 12, fontFamily: font.semibold },
  sectionKicker: { marginTop: 22 },
  sectionTitle: { fontSize: 20, marginTop: 2 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  toggleCopy: { flex: 1, gap: 3 },
  toggleLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleTitle: { fontSize: 14, fontFamily: font.bold },
  toggleSub: { fontSize: 12, fontFamily: font.medium, lineHeight: 16 },
  doneBtn: { marginTop: 22, borderRadius: 14, alignItems: 'center', paddingVertical: 14 },
  doneText: { fontSize: 15, fontFamily: font.extrabold },
});
