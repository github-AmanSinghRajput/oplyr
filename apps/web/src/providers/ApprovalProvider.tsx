import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useApi } from './ApiProvider';
import { useStatus } from './StatusProvider';
import { useToast } from './ToastProvider';
import type { ApprovalHistoryEntry } from '@/containers/voice-console/lib/types';

interface ApprovalContextValue {
  approvals: ApprovalHistoryEntry[];
  isApproving: boolean;
  isRejecting: boolean;
  loadApprovals: () => Promise<void>;
  handleApprove: () => Promise<void>;
  handleReject: () => Promise<void>;
}

const ApprovalContext = createContext<ApprovalContextValue | null>(null);

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const { service } = useApi();
  const { status, refreshStatus } = useStatus();
  const { pushToast } = useToast();

  const [approvals, setApprovals] = useState<ApprovalHistoryEntry[]>([]);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const loadApprovals = useCallback(async () => {
    try {
      const body = await service.getApprovals();
      setApprovals(body.approvals);
    } catch {
      // Silent — approvals are fetched on demand
    }
  }, [service]);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const handleApprove = useCallback(async () => {
    if (!status?.pendingApproval) return;

    setIsApproving(true);
    try {
      await service.approveChange(status.pendingApproval.id);
      await Promise.all([refreshStatus(), loadApprovals()]);
      pushToast(
        'success',
        'Changes approved',
        'The approved diff has been applied to the workspace.'
      );
    } catch (err) {
      pushToast(
        'error',
        'Approve failed',
        err instanceof Error ? err.message : 'Unable to approve changes.'
      );
    } finally {
      setIsApproving(false);
    }
  }, [service, status?.pendingApproval, refreshStatus, loadApprovals, pushToast]);

  const handleReject = useCallback(async () => {
    if (!status?.pendingApproval) return;

    setIsRejecting(true);
    try {
      await service.rejectChange(status.pendingApproval.id);
      await Promise.all([refreshStatus(), loadApprovals()]);
      pushToast('info', 'Changes rejected', 'Pending write request was declined.');
    } catch (err) {
      pushToast(
        'error',
        'Reject failed',
        err instanceof Error ? err.message : 'Unable to reject changes.'
      );
    } finally {
      setIsRejecting(false);
    }
  }, [service, status?.pendingApproval, refreshStatus, loadApprovals, pushToast]);

  return (
    <ApprovalContext
      value={{
        approvals,
        isApproving,
        isRejecting,
        loadApprovals,
        handleApprove,
        handleReject
      }}
    >
      {children}
    </ApprovalContext>
  );
}

export function useApproval() {
  const ctx = useContext(ApprovalContext);
  if (!ctx) throw new Error('useApproval must be used within ApprovalProvider');
  return ctx;
}
