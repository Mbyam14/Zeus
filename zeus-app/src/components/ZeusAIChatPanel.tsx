import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  ActivityIndicator,
  Alert,
  ScrollView,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Markdown from 'react-native-markdown-display';
import { useChatStore } from '../store/chatStore';
import { useThemeStore } from '../store/themeStore';
import { chatService, MemoryFact } from '../services/chatService';
import { ChatMessage } from '../services/chatService';
import { trackEvent } from '../services/analyticsService';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const QUICK_PROMPTS = [
  'What should I cook tonight?',
  'Help me meal prep this week',
  'Surprise me with something new',
  'What can I make with my pantry?',
];

export const ZeusAIChatPanel: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeStore();
  const isOpen = useChatStore((s) => s.isOpen);
  const closeChat = useChatStore((s) => s.closeChat);
  const messages = useChatStore((s) => s.messages);
  const hasMore = useChatStore((s) => s.hasMore);
  const isLoading = useChatStore((s) => s.isLoading);
  const isSending = useChatStore((s) => s.isSending);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const clearHistory = useChatStore((s) => s.clearHistory);

  const [inputText, setInputText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  // Load history when panel opens
  useEffect(() => {
    if (isOpen) {
      loadHistory();
      trackEvent('zeus_chat_opened');
    }
  }, [isOpen]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    setInputText('');
    setError(null);

    try {
      await sendMessage(text);
      trackEvent('zeus_chat_message_sent');
    } catch (e: any) {
      setError('Failed to send message. Try again.');
    }
  }, [inputText, isSending, sendMessage]);

  const handleQuickPrompt = (prompt: string) => {
    setInputText(prompt);
    // Auto-send quick prompts
    useChatStore.getState().sendMessage(prompt).then(() => {
      trackEvent('zeus_chat_message_sent', { quick_prompt: true });
    }).catch(() => {
      setError('Failed to send. Try again.');
    });
  };

  const handleLoadMore = () => {
    if (!hasMore || isLoading || messages.length === 0) return;
    const oldestId = messages[messages.length - 1]?.id;
    if (oldestId && !oldestId.startsWith('temp-')) {
      loadHistory(oldestId);
    }
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Chat History',
      'This will delete all messages but keep what Zeus has learned about you.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearHistory();
            setShowMenu(false);
          },
        },
      ],
    );
  };

  const handleClearMemory = () => {
    Alert.alert(
      'Reset Zeus AI Memory',
      'Are you sure? Zeus will forget everything it has learned about your cooking preferences, habits, and tastes. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Reset Memory',
          style: 'destructive',
          onPress: async () => {
            try {
              await chatService.clearMemory();
              setShowMenu(false);
              Alert.alert('Memory Cleared', 'Zeus will start learning about you fresh.');
            } catch {
              Alert.alert('Error', 'Failed to clear memory. Please try again.');
            }
          },
        },
      ],
    );
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

    if (isToday) return time;
    if (isYesterday) return `Yesterday ${time}`;
    return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
  };

  const markdownStyles = {
    body: { color: colors.text, fontSize: 15, lineHeight: 21 },
    strong: { fontWeight: '700' as const },
    bullet_list: { marginVertical: 4 },
    ordered_list: { marginVertical: 4 },
    list_item: { marginVertical: 2 },
    paragraph: { marginVertical: 2 },
    heading1: { fontSize: 18, fontWeight: '700' as const, color: colors.text, marginVertical: 4 },
    heading2: { fontSize: 16, fontWeight: '700' as const, color: colors.text, marginVertical: 4 },
    heading3: { fontSize: 15, fontWeight: '700' as const, color: colors.text, marginVertical: 2 },
    code_inline: { backgroundColor: colors.backgroundSecondary, paddingHorizontal: 4, borderRadius: 4, fontSize: 13 },
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    const isTemp = item.id.startsWith('temp-');

    return (
      <View
        style={[
          styles.messageBubble,
          isUser
            ? [styles.userBubble, { backgroundColor: colors.primary }]
            : [styles.assistantBubble, { backgroundColor: colors.card, borderColor: colors.border }],
        ]}
      >
        {!isUser && (
          <View style={styles.assistantLabelRow}>
            <Ionicons name="flash" size={12} color={colors.primary} />
            <Text style={[styles.assistantLabel, { color: colors.primary }]}>
              {' '}Zeus
            </Text>
          </View>
        )}
        {!isUser && !isTemp ? (
          <Markdown style={markdownStyles}>
            {item.content}
          </Markdown>
        ) : (
          <Text
            style={[
              styles.messageText,
              { color: isUser ? '#FFF' : colors.text },
              isTemp && { opacity: 0.6 },
            ]}
          >
            {item.content}
          </Text>
        )}
        <Text
          style={[
            styles.messageTime,
            { color: isUser ? 'rgba(255,255,255,0.6)' : colors.textMuted },
          ]}
        >
          {isTemp ? 'Sending...' : formatTime(item.created_at)}
        </Text>
      </View>
    );
  };

  const renderTypingIndicator = () => {
    if (!isSending) return null;
    return (
      <View style={[styles.assistantBubble, styles.messageBubble, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.assistantLabelRow}>
          <Ionicons name="flash" size={12} color={colors.primary} />
          <Text style={[styles.assistantLabel, { color: colors.primary }]}>
            {' '}Zeus
          </Text>
        </View>
        <View style={styles.typingDots}>
          {[0, 1, 2].map((i) => (
            <TypingDot key={i} delay={i * 200} color={colors.textMuted} />
          ))}
        </View>
      </View>
    );
  };

  const renderQuickPrompts = () => {
    if (messages.length > 0) return null;
    return (
      <View style={styles.quickPromptsContainer}>
        <View style={styles.welcomeTitleRow}>
          <Ionicons name="flash" size={24} color={colors.primary} />
          <Text style={[styles.welcomeTitle, { color: colors.text }]}>
            {' '}Hey! I'm Zeus
          </Text>
        </View>
        <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>
          Your personal cooking companion. Ask me anything about cooking, meals, or your kitchen.
        </Text>
        <View style={styles.quickPrompts}>
          {QUICK_PROMPTS.map((prompt) => (
            <TouchableOpacity
              key={prompt}
              onPress={() => handleQuickPrompt(prompt)}
              style={[styles.quickPromptChip, { borderColor: colors.border, backgroundColor: colors.backgroundSecondary }]}
            >
              <Text style={[styles.quickPromptText, { color: colors.text }]} numberOfLines={1}>
                {prompt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent
      onRequestClose={closeChat}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <TouchableOpacity style={styles.backdrop} onPress={closeChat} activeOpacity={1} />

        <View
          style={[
            styles.panel,
            {
              backgroundColor: colors.background,
              maxHeight: SCREEN_HEIGHT * 0.85,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerLeft}>
              <Ionicons name="flash" size={20} color={colors.primary} />
              <Text style={[styles.headerTitle, { color: colors.text }]}> Zeus AI</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity onPress={() => setShowMenu(!showMenu)} style={styles.menuBtn}>
                <Ionicons name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={closeChat} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Menu dropdown */}
          {showMenu && (
            <View style={[styles.menu, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <TouchableOpacity onPress={handleClearHistory} style={styles.menuItem}>
                <Text style={[styles.menuItemText, { color: colors.text }]}>Clear Chat History</Text>
              </TouchableOpacity>
              <View style={[styles.menuDivider, { backgroundColor: colors.border }]} />
              <TouchableOpacity onPress={handleClearMemory} style={styles.menuItem}>
                <Text style={[styles.menuItemText, { color: colors.error }]}>Reset AI Memory</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={(item) => item.id}
            inverted
            contentContainerStyle={styles.messagesList}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={renderTypingIndicator}
            ListEmptyComponent={renderQuickPrompts}
            ListFooterComponent={
              isLoading && hasMore ? (
                <ActivityIndicator color={colors.primary} style={{ padding: 12 }} />
              ) : null
            }
          />

          {/* Quick prompts row when there are messages */}
          {messages.length > 0 && messages.length < 4 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.inlinePrompts}
            >
              {QUICK_PROMPTS.map((prompt) => (
                <TouchableOpacity
                  key={prompt}
                  onPress={() => handleQuickPrompt(prompt)}
                  style={[styles.inlineChip, { borderColor: colors.border }]}
                >
                  <Text style={[styles.inlineChipText, { color: colors.textSecondary }]} numberOfLines={1}>
                    {prompt}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Error */}
          {error && (
            <View style={[styles.errorBar, { backgroundColor: colors.error + '20' }]}>
              <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}>
                <Ionicons name="close-circle" size={18} color={colors.error} />
              </TouchableOpacity>
            </View>
          )}

          {/* Input */}
          <View style={[styles.inputContainer, { borderTopColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                {
                  backgroundColor: colors.inputBackground,
                  color: colors.text,
                  borderColor: colors.border,
                },
              ]}
              placeholder="Ask Zeus anything..."
              placeholderTextColor={colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={2000}
              editable={!isSending}
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={!inputText.trim() || isSending}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    inputText.trim() && !isSending ? colors.primary : colors.border,
                },
              ]}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="arrow-up" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// Animated typing dot
const TypingDot: React.FC<{ delay: number; color: string }> = ({ delay, color }) => {
  const opacity = React.useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 400, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: color, opacity }]}
    />
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 300,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  menuBtn: {
    padding: 8,
  },
  closeBtn: {
    padding: 8,
  },
  menu: {
    position: 'absolute',
    top: 56,
    right: 16,
    borderRadius: 12,
    borderWidth: 1,
    zIndex: 100,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    minWidth: 200,
  },
  menuItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  menuItemText: {
    fontSize: 15,
  },
  menuDivider: {
    height: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginVertical: 4,
  },
  userBubble: {
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  assistantLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  assistantLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 21,
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  typingDots: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  quickPromptsContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 40,
    // Inverted list means this shows at the "bottom" visually (top of list)
    transform: [{ scaleY: -1 }],
  },
  welcomeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
  },
  welcomeSubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  quickPrompts: {
    gap: 10,
    width: '100%',
  },
  quickPromptChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  quickPromptText: {
    fontSize: 14,
  },
  inlinePrompts: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  inlineChip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inlineChipText: {
    fontSize: 13,
  },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 16,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 13,
    flex: 1,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
