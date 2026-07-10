import React from 'react';
import { NativeTabs, Icon, Label, VectorIcon } from 'expo-router/unstable-native-tabs';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAccent } from '@/hooks/useAccent';

// Apple-native tab bar (real iOS 26 Liquid Glass). Built on expo-router's
// native tabs, which wrap UITabBarController via react-native-screens — so the
// glass, blur, and minimize-on-scroll are rendered by the OS, not faked in JS.
export default function TabLayout() {
  const { accent } = useAccent();

  return (
    <NativeTabs tintColor={accent} minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <Label>Matches</Label>
        <Icon src={<VectorIcon family={MaterialCommunityIcons} name="soccer-field" />} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="bracket">
        <Label>Bracket</Label>
        <Icon sf={{ default: 'trophy', selected: 'trophy.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="news">
        <Label>News</Label>
        <Icon sf={{ default: 'newspaper', selected: 'newspaper.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="teams">
        <Label>Teams</Label>
        <Icon sf={{ default: 'shield', selected: 'shield.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
