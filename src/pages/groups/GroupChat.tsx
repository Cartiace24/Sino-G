import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Send, Trash2, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup, useMyGroups, useRealtimeGroup } from '../../hooks/useGroups';
import {
  useDeleteMessage,
  useGroupMessages,
  useRealtimeGroupChat,
  useSendMessage,
} from '../../hooks/useChat';
import { useMarkGroupChatRead, useUnreadChatGroups } from '../../hooks/useNotifications';
import { CHAT_MAX_LENGTH } from '../../services/chat.service';
import { timeAgo } from '../../utils/time';
import { Avatar } from '../../components/common/Avatar';
import { EmptyState, LoadingRows } from '../../components/common/Feedback';
import { useConfirm } from '../../components/common/ConfirmSheet';
import { Button } from '../../components/ui/button';
import type { MessageWithSender } from '../../types/app.types';

/** Same-sender runs within 5 minutes share one avatar/name header. */
function showMeta(prev: MessageWithSender | undefined, cur: MessageWithSender): boolean {
  if (!prev || prev.sender_id !== cur.sender_id) return true;
  return new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000;
}

function sameLocalDay(a: string, b: string): boolean {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function dayDividerLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return 'TODAY';
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return 'YESTERDAY';
  return d
    .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}

function scrollToBottom(smooth: boolean): void {
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

export function GroupChat() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const groupQ = useGroup(groupId);
  const myGroupsQ = useMyGroups(user?.id);
  const messagesQ = useGroupMessages(groupId);
  const sendMut = useSendMessage(groupId);
  const deleteMut = useDeleteMessage(groupId);
  const confirm = useConfirm();
  useRealtimeGroupChat(groupId);
  // Membership loss / group deletion degrades to the can't-open state below.
  useRealtimeGroup(groupId);

  // Opening the conversation acknowledges it: silently clear this group's
  // unread message dots (once per mount; realtime keeps them truthful after).
  const { mutate: markChatRead } = useMarkGroupChatRead();
  const unreadChat = useUnreadChatGroups(user?.id);
  const markedRef = useRef(false);
  useEffect(() => {
    if (!groupId || markedRef.current || !unreadChat.has(groupId)) return;
    markedRef.current = true;
    markChatRead(groupId);
  }, [groupId, unreadChat, markChatRead]);

  const [draft, setDraft] = useState('');
  const loadedOnce = useRef(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  // Unseen arrivals while reading history (cleared on jump-to-latest).
  const [newCount, setNewCount] = useState(0);
  const lastLen = useRef(0);

  // Autogrow to ~4 rows, then scroll internally.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 124)}px`;
  }, [draft]);

  const group = groupQ.data;
  const memberCount = myGroupsQ.data?.find((g) => g.id === groupId)?.member_count;

  const items = useMemo<MessageWithSender[]>(
    () =>
      (messagesQ.data?.pages ?? [])
        .flatMap((pg) => pg.messages)
        .reverse(),
    [messagesQ.data],
  );

  // First paint lands at the newest message; afterwards follow new arrivals
  // only when already near the bottom (never yank a user reading history).
  // Missed arrivals surface as a jump-to-latest pill instead.
  useEffect(() => {
    if (items.length === 0) return;
    const nearBottom =
      window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 200;
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      lastLen.current = items.length;
      scrollToBottom(false);
      return;
    }
    if (nearBottom) {
      lastLen.current = items.length;
      setNewCount(0);
    } else if (items.length > lastLen.current) {
      setNewCount(items.length - lastLen.current);
    }
  }, [items.length]);

  const jumpToLatest = () => {
    lastLen.current = items.length;
    setNewCount(0);
    scrollToBottom(true);
  };

  const submit = () => {
    const content = draft.trim();
    // isPending guard doubles as send debounce (no double-tap duplicates).
    if (!content || sendMut.isPending) return;
    // Clear immediately — the optimistic row is already in the list.
    // A failed send restores the text so nothing is lost.
    setDraft('');
    sendMut.mutate(content, {
      onSuccess: () => {
        window.setTimeout(() => scrollToBottom(true), 60);
      },
      onError: () => {
        setDraft(content);
      },
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const onDelete = async (m: MessageWithSender) => {    const ok = await confirm({
      title: 'DELETE MESSAGE?',
      body: 'This can’t be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteMut.mutate(m.id);
  };

  if (groupQ.isLoading) return <LoadingRows rows={5} />;
  if (!group) {
    return (
      <div style={{ paddingTop: 30 }}>
        <EmptyState
          icon={<Users size={30} />}
          title="Can't open this group."
          body="You may have been removed, or the link is wrong."
          action={
            <Button variant="line" size="sm" onClick={() => navigate('/groups')}>
              Back to groups
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <>
      <Link className="backlink" to={`/groups/${group.id}`} style={{ marginTop: 14 }}>
        <ArrowLeft size={16} /> {group.name.toUpperCase().slice(0, 18)}
      </Link>
      <p className="kicker">SINO G · GROUP CHAT</p>
      <h1 className="display md">CHAT</h1>
      <p className="small muted" style={{ marginTop: 6 }}>
        {group.name}
        {memberCount != null ? ` · ${memberCount} member${memberCount === 1 ? '' : 's'}` : ''}
      </p>

      <div style={{ marginTop: 6 }}>
        {messagesQ.isLoading ? (
          <LoadingRows rows={4} />
        ) : messagesQ.isError ? (
          <EmptyState
            icon={<MessageCircle size={30} />}
            title="Couldn't load messages."
            body="Check your connection and try again."
            action={
              <Button variant="line" size="sm" onClick={() => messagesQ.refetch()}>
                Retry
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <div style={{ marginTop: 10 }}>
            <EmptyState icon={<MessageCircle size={30} />} title="NO MESSAGES YET." body="Start the conversation." />
          </div>
        ) : (
          <>
            {messagesQ.hasNextPage && (
              <div style={{ textAlign: 'center', margin: '10px 0 4px' }}>
                <Button
                  variant="paper"
                  size="sm"
                  disabled={messagesQ.isFetchingNextPage}
                  onClick={() => messagesQ.fetchNextPage()}
                >
                  {messagesQ.isFetchingNextPage ? 'Loading…' : 'Load earlier messages'}
                </Button>
              </div>
            )}
            <div className="rows" style={{ marginTop: 8 }}>
              {items.map((m, i) => {
                const meta = showMeta(items[i - 1], m);
                const newDay = i === 0 || !sameLocalDay(items[i - 1].created_at, m.created_at);
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div style={{ textAlign: 'center', margin: '10px 0 2px' }}>
                        <span className="kicker" style={{ background: 'var(--bg-deep)', borderRadius: 999, padding: '4px 12px' }}>
                          {dayDividerLabel(m.created_at)}
                        </span>
                      </div>
                    )}
                  <div className="member-row" style={{ alignItems: 'flex-start' }}>
                    {meta ? (
                      <Avatar name={m.sender?.display_name ?? '?'} src={m.sender?.avatar_url} size="sm" />
                    ) : (
                      <span style={{ width: 32, flexShrink: 0 }} />
                    )}
                    <span className="who">
                      {meta && (
                        <strong>
                          {mine ? 'You' : (m.sender?.display_name ?? 'Someone')}
                          <span className="muted small" style={{ fontWeight: 400 }}>
                            {' '}
                            · {timeAgo(m.created_at)}
                          </span>
                        </strong>
                      )}
                      {/* Plain text only: React escapes content, never innerHTML. */}
                      <small style={{ fontSize: 14.5, color: 'var(--ink)', whiteSpace: 'pre-wrap' }}>
                        {m.content}
                      </small>
                    </span>
                    <span className="right">
                      {mine && (
                        <button
                          aria-label="Delete message"
                          disabled={deleteMut.isPending}
                          onClick={() => onDelete(m)}
                          style={{ color: 'var(--muted)', display: 'grid', placeItems: 'center', padding: 6 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </span>
                  </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {newCount > 0 && (
        <button
          type="button"
          className="btn btn-dark btn-sm"
          onClick={jumpToLatest}
          aria-live="polite"
          style={{
            position: 'fixed',
            bottom: 208,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            borderRadius: 999,
            boxShadow: '0 8px 24px rgba(24,24,23,.25)',
          }}
        >
          ↓ {newCount} new message{newCount === 1 ? '' : 's'}
        </button>
      )}
      <form
        onSubmit={onSubmit}
        style={{
          position: 'sticky',
          bottom: 84,
          background: 'var(--bg)',
          padding: '12px 0 6px',
          marginTop: 12,
        }}
      >
        <div className="field" style={{ marginBottom: 8 }}>
          <textarea
            ref={taRef}
            className="input"
            rows={1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Message the group..."
            maxLength={CHAT_MAX_LENGTH + 1}
            aria-label="Message the group"
            style={{ resize: 'none', overflowY: 'auto', maxHeight: 124 }}
          />
        </div>
        <div className="row-between">
          <span className="small muted">
            {draft.length > CHAT_MAX_LENGTH - 100 ? `${draft.length}/${CHAT_MAX_LENGTH}` : ''}
          </span>
          <Button type="submit" variant="green" size="sm" disabled={!draft.trim() || sendMut.isPending}>
            <Send size={15} /> {sendMut.isPending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </form>
    </>
  );
}
