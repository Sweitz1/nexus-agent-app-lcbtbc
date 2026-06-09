import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { COLORS, FONTS } from '@/constants/theme';
import { ChevronDown, ChevronRight, Terminal, Brain, Wrench, CheckCircle, Lightbulb, Flag, AlertTriangle } from 'lucide-react-native';
import { AnimatedPressable } from '@/components/AnimatedPressable';

export interface TaskStep {
  id: string;
  step_type: 'plan' | 'thought' | 'tool_call' | 'tool_result' | 'reflection' | 'final' | 'approval_request';
  content: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  status?: string;
  created_at: string;
}

interface StepRowProps {
  step: TaskStep;
  onApprove?: (stepId: string) => void;
  onReject?: (stepId: string) => void;
}

const STEP_CONFIG = {
  plan: {
    label: 'Plan',
    color: COLORS.plan,
    bg: COLORS.planMuted,
    Icon: Flag,
    border: 'rgba(167,139,250,0.25)',
  },
  thought: {
    label: 'Thought',
    color: COLORS.thought,
    bg: COLORS.thoughtMuted,
    Icon: Brain,
    border: 'rgba(96,165,250,0.25)',
  },
  tool_call: {
    label: 'Tool Call',
    color: COLORS.toolCall,
    bg: COLORS.toolCallMuted,
    Icon: Terminal,
    border: 'rgba(245,158,11,0.25)',
  },
  tool_result: {
    label: 'Result',
    color: COLORS.toolResult,
    bg: COLORS.toolResultMuted,
    Icon: CheckCircle,
    border: 'rgba(52,211,153,0.25)',
  },
  reflection: {
    label: 'Reflection',
    color: COLORS.reflection,
    bg: COLORS.reflectionMuted,
    Icon: Lightbulb,
    border: 'rgba(192,132,252,0.25)',
  },
  final: {
    label: 'Final',
    color: COLORS.final,
    bg: COLORS.finalMuted,
    Icon: CheckCircle,
    border: 'rgba(0,255,159,0.25)',
  },
  approval_request: {
    label: 'Approval Needed',
    color: COLORS.approval,
    bg: COLORS.approvalMuted,
    Icon: AlertTriangle,
    border: 'rgba(255,68,102,0.35)',
  },
};

export function StepRow({ step, onApprove, onReject }: StepRowProps) {
  const [expanded, setExpanded] = useState(step.step_type === 'approval_request');
  const config = STEP_CONFIG[step.step_type] || STEP_CONFIG.thought;
  const { Icon } = config;

  const isCode = step.step_type === 'tool_call' || step.step_type === 'tool_result';
  const isQuote = step.step_type === 'thought' || step.step_type === 'reflection';
  const isApproval = step.step_type === 'approval_request';

  const toolInputStr = step.tool_input ? JSON.stringify(step.tool_input, null, 2) : '';

  return (
    <View style={[styles.container, { borderLeftColor: config.border }]}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={styles.header}
      >
        <View style={[styles.typeBadge, { backgroundColor: config.bg }]}>
          <Icon size={12} color={config.color} />
          <Text style={[styles.typeLabel, { color: config.color }]}>{config.label}</Text>
        </View>
        {step.tool_name && (
          <Text style={styles.toolName}>{step.tool_name}</Text>
        )}
        <View style={styles.spacer} />
        {expanded ? (
          <ChevronDown size={14} color={COLORS.textTertiary} />
        ) : (
          <ChevronRight size={14} color={COLORS.textTertiary} />
        )}
      </Pressable>

      {expanded && (
        <View style={styles.body}>
          {isCode ? (
            <View style={styles.codeBlock}>
              {step.tool_name && (
                <Text style={styles.codeLabel}>{step.tool_name}</Text>
              )}
              {toolInputStr ? (
                <Text style={styles.codeText} selectable>{toolInputStr}</Text>
              ) : null}
              {step.content ? (
                <Text style={styles.codeText} selectable>{step.content}</Text>
              ) : null}
            </View>
          ) : isQuote ? (
            <View style={[styles.quoteBlock, { borderLeftColor: config.color }]}>
              <Text style={styles.quoteText} selectable>{step.content}</Text>
            </View>
          ) : (
            <Text style={styles.contentText} selectable>{step.content}</Text>
          )}

          {isApproval && (
            <View style={styles.approvalActions}>
              <AnimatedPressable
                style={styles.approveBtn}
                onPress={() => {
                  console.log('[StepRow] Approve pressed for step:', step.id);
                  onApprove?.(step.id);
                }}
              >
                <Text style={styles.approveBtnText}>Approve</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.rejectBtn}
                onPress={() => {
                  console.log('[StepRow] Reject pressed for step:', step.id);
                  onReject?.(step.id);
                }}
              >
                <Text style={styles.rejectBtnText}>Reject</Text>
              </AnimatedPressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderLeftWidth: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
  },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 4,
  },
  typeLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  toolName: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: FONTS.mono,
  },
  spacer: {
    flex: 1,
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  codeBlock: {
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  codeLabel: {
    fontSize: 10,
    color: COLORS.toolCall,
    fontFamily: FONTS.mono,
    fontWeight: '700',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  codeText: {
    fontSize: 12,
    color: COLORS.text,
    fontFamily: FONTS.mono,
    lineHeight: 18,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    paddingLeft: 12,
    paddingVertical: 4,
  },
  quoteText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    fontStyle: 'italic',
  },
  contentText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 21,
  },
  approvalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: COLORS.primaryMuted,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,255,159,0.3)',
  },
  approveBtnText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  rejectBtn: {
    flex: 1,
    backgroundColor: COLORS.dangerMuted,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,68,102,0.3)',
  },
  rejectBtnText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '700',
  },
});
