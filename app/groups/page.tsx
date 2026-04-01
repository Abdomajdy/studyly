"use client"
import { useEffect, useState, useCallback, useRef, Suspense } from "react"
import { supabase } from "@/lib/supabase"
import { getMastery } from "@/services/mastery.service"
import { useRouter, useSearchParams } from "next/navigation"
import Sidebar from "@/components/Sidebar"
import { useSidebarData } from "@/lib/useSidebarData"
import {
  type MasteryRow,
  getScoreColor,
} from "@/lib/helpers"
import {
  getGroupDetail,
  getGroupWeakTopics,
  leaveGroup,
  joinGroup,
  getFriends,
  getMyGroups,
  sendGroupInvite,
  type GroupDetail,
  type GroupMember,
  type SharedWeakTopic,
} from "@/services/social.service"
import type { FriendWithPresence } from "@/lib/helpers"
import { toast } from "sonner"

function statusDot(status: string): string {
  if (status === "studying") return "var(--success)"
  if (status === "online") return "var(--success)"
  if (status === "idle") return "var(--accent)"
  return "var(--text-3)"
}

// ── Ambient noise generator (Web Audio API — no external URLs) ──────────────
function AmbientPlayer() {
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<"brown" | "rain" | "white">("brown")
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)

  function generateNoise(type: "brown" | "rain" | "white", ctx: AudioContext): AudioBuffer {
    const sampleRate = ctx.sampleRate
    const length = sampleRate * 4 // 4-second loop
    const buffer = ctx.createBuffer(2, length, sampleRate)

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch)
      let last = 0
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1
        if (type === "white") {
          data[i] = white * 0.3
        } else if (type === "brown") {
          last = (last + 0.02 * white) / 1.02
          data[i] = last * 3.5
        } else {
          // "rain" — filtered noise with random crackle
          last = (last + 0.04 * white) / 1.04
          const crackle = Math.random() < 0.001 ? (Math.random() - 0.5) * 0.4 : 0
          data[i] = last * 2.5 + crackle
        }
      }
    }
    return buffer
  }

  const start = useCallback((noiseType: "brown" | "rain" | "white") => {
    const ctx = ctxRef.current || new AudioContext()
    ctxRef.current = ctx

    // Stop existing
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} }

    const buffer = generateNoise(noiseType, ctx)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true

    const gain = ctx.createGain()
    gain.gain.value = 0.25
    gainRef.current = gain

    source.connect(gain).connect(ctx.destination)
    source.start()
    sourceRef.current = source
    setPlaying(true)
  }, [])

  const stop = useCallback(() => {
    if (sourceRef.current) { try { sourceRef.current.stop() } catch {} }
    sourceRef.current = null
    setPlaying(false)
  }, [])

  const toggle = useCallback(() => {
    if (playing) stop()
    else start(mode)
  }, [playing, mode, start, stop])

  // Switch noise type while playing
  useEffect(() => {
    if (playing) start(mode)
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (sourceRef.current) { try { sourceRef.current.stop() } catch {} } }
  }, [])

  const noises: { key: "brown" | "rain" | "white"; label: string }[] = [
    { key: "brown", label: "deep focus" },
    { key: "rain",  label: "rain" },
    { key: "white", label: "white" },
  ]

  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "20px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
        <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase" }}>ambient</p>
        <button
          onClick={toggle}
          style={{
            background: playing ? "var(--accent)" : "var(--bg-3)",
            border: "none", color: playing ? "var(--bg)" : "var(--text-3)",
            padding: "6px 14px", fontSize: "10px", fontFamily: "DM Mono, monospace",
            cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
            transition: "all 0.2s",
          }}
        >
          {playing ? "pause" : "play"}
        </button>
      </div>
      <div style={{ display: "flex", gap: "6px" }}>
        {noises.map(n => (
          <button
            key={n.key}
            onClick={() => setMode(n.key)}
            style={{
              background: mode === n.key ? "var(--bg-3)" : "transparent",
              border: `1px solid ${mode === n.key ? "var(--text-3)" : "var(--border)"}`,
              color: mode === n.key ? "var(--text-2)" : "var(--text-3)",
              padding: "5px 12px", fontSize: "10px", fontFamily: "DM Mono, monospace",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            {n.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function GroupsPageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    }>
      <GroupsPage />
    </Suspense>
  )
}

function GroupsPage() {
  const router = useRouter()
  const sidebar = useSidebarData()
  const searchParams = useSearchParams()
  const groupId = searchParams.get("id") || ""
  const joinId = searchParams.get("join") || ""

  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(false)
  const [userId, setUserId] = useState("")

  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [weakTopics, setWeakTopics] = useState<SharedWeakTopic[]>([])

  // Join flow state
  const [joinGroup_, setJoinGroup] = useState<{ name: string; course: string; member_count: number } | null>(null)
  const [joining, setJoining] = useState(false)

  // Invite link copied
  const [copied, setCopied] = useState(false)

  // Invite friends to group
  const [myFriends, setMyFriends] = useState<FriendWithPresence[]>([])
  const [showInvitePanel, setShowInvitePanel] = useState(false)

  // Sidebar
  const [mastery, setMastery] = useState<MasteryRow[]>([])
  const [totalSessions, setTotalSessions] = useState(0)

  const [hoveredMember, setHoveredMember] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return router.push("/login")
      setUserId(user.id)

      // Join flow — someone opened an invite link
      if (joinId) {
        const detail = await getGroupDetail(joinId)
        if (detail) {
          // Check if already a member
          const isMember = detail.members.some(m => m.user_id === user.id)
          if (isMember) {
            router.replace(`/groups?id=${joinId}`)
            return
          }
          setJoinGroup({ name: detail.name, course: detail.course, member_count: detail.members.length })
        }
        setLoading(false)
        setTimeout(() => setVisible(true), 50)
        return
      }

      if (!groupId) { setLoading(false); return }

      const [groupData, weakData, masteryData, friendsData] = await Promise.all([
        getGroupDetail(groupId),
        getGroupWeakTopics(groupId),
        getMastery(user.id),
        getFriends(user.id),
      ])

      if (groupData) setGroup(groupData)
      setWeakTopics(weakData)
      setMastery(masteryData)
      setMyFriends(friendsData)

      const { count } = await supabase
        .from("study_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
      setTotalSessions(count ?? 0)

      setLoading(false)
      setTimeout(() => setVisible(true), 50)
    }
    load()
  }, [router, groupId, joinId])

  const handleLeave = async () => {
    if (!userId || !groupId) return
    const ok = await leaveGroup(userId, groupId)
    if (ok) router.push("/dashboard")
  }

  const handleJoin = async () => {
    if (!userId || !joinId) return
    setJoining(true)
    const result = await joinGroup(userId, joinId)
    if (result.success) {
      toast.success("joined the group!")
      router.replace(`/groups?id=${joinId}`)
    } else {
      toast.error(result.error || "failed to join")
    }
    setJoining(false)
  }

  const copyInviteLink = () => {
    const link = `${window.location.origin}/groups?join=${groupId}`
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const activeMemberCount = group?.members.filter(m => m.status === "studying" || m.status === "online").length ?? 0

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "var(--text-3)", fontSize: "12px", letterSpacing: "0.1em" }}>loading...</p>
      </div>
    )
  }

  // ── Join flow screen ──────────────────────────────────────────────────────
  if (joinId) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
        <div style={{ textAlign: "center", maxWidth: "360px", padding: "40px" }}>
          {joinGroup_ ? (
            <>
              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                you&apos;ve been invited to
              </p>
              <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: "28px", color: "var(--text)", marginBottom: "8px" }}>
                {joinGroup_.name}
              </h2>
              <p style={{ color: "var(--accent-dim)", fontSize: "12px", fontFamily: "DM Mono, monospace", marginBottom: "4px" }}>
                {joinGroup_.course}
              </p>
              <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginBottom: "32px" }}>
                {joinGroup_.member_count}/6 members
              </p>

              {joinGroup_.member_count >= 6 ? (
                <p style={{ color: "var(--danger)", fontSize: "12px", fontFamily: "DM Mono, monospace" }}>
                  this group is full
                </p>
              ) : (
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  style={{
                    background: "var(--text)", color: "var(--bg)", border: "none",
                    padding: "14px 40px", fontFamily: "DM Mono, monospace", fontSize: "12px",
                    cursor: joining ? "not-allowed" : "pointer", letterSpacing: "0.08em",
                    textTransform: "uppercase", width: "100%", opacity: joining ? 0.5 : 1,
                    transition: "opacity 0.2s",
                  }}
                >
                  {joining ? "joining..." : "join group"}
                </button>
              )}

              <button
                onClick={() => router.push("/dashboard")}
                style={{
                  background: "none", border: "none", color: "var(--text-3)",
                  fontFamily: "DM Mono, monospace", fontSize: "11px", cursor: "pointer",
                  marginTop: "20px", padding: 0,
                }}
              >
                back to dashboard
              </button>
            </>
          ) : (
            <>
              <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace", marginBottom: "16px" }}>
                group not found or link expired
              </p>
              <button
                onClick={() => router.push("/dashboard")}
                style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-2)", padding: "10px 24px", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer" }}
              >
                back to dashboard
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (!group) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "var(--text-3)", fontSize: "13px", fontFamily: "DM Mono, monospace", marginBottom: "16px" }}>group not found</p>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-2)", padding: "10px 24px", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer" }}
          >
            back to dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", opacity: visible ? 1 : 0, transition: "opacity 0.6s ease" }}>
      <Sidebar
        activePage="groups"
        stats={{
          totalSessions,
          masteryCount: mastery.length,
          weakCount: mastery.filter(m => m.score < 40).length,
          avgMastery: mastery.length > 0 ? Math.round(mastery.reduce((s, m) => s + m.score, 0) / mastery.length) : null,
        }}
        friends={sidebar.friends}
        groups={sidebar.groups}
        pendingCount={sidebar.pendingCount}
      />

      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto", padding: "48px 48px 80px" }}>

          {/* Back */}
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              background: "none", border: "none", color: "var(--text-3)",
              fontSize: "11px", fontFamily: "DM Mono, monospace", cursor: "pointer",
              letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "40px",
              padding: 0, transition: "color 0.2s",
            }}
            onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
          >
            &larr; dashboard
          </button>

          {/* ═══════════════════════════════════════════════════════════════
              HEADER
              ═══════════════════════════════════════════════════════════ */}
          <div style={{ marginBottom: "48px" }}>
            <p style={{ color: "var(--accent-dim)", fontSize: "12px", fontFamily: "DM Mono, monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px" }}>
              {group.course}
            </p>
            <h1 style={{
              fontFamily: "DM Serif Display, serif", fontSize: "40px",
              color: "var(--text)", letterSpacing: "-0.02em", lineHeight: 1.1,
              marginBottom: "16px",
            }}>
              {group.name}
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <span style={{ fontSize: "11px", fontFamily: "DM Mono, monospace", color: "var(--text-3)" }}>
                {group.members.length}/6 members
              </span>
              {activeMemberCount > 0 && (
                <span style={{ fontSize: "11px", fontFamily: "DM Mono, monospace", color: "var(--success)" }}>
                  {activeMemberCount} online now
                </span>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              TWO-COLUMN: Members + Right panel
              ═══════════════════════════════════════════════════════════ */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "40px", marginBottom: "48px" }}>

            {/* ── LEFT: Members ──────────────────────────────────────────── */}
            <div>
              <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                members
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                {group.members.map((member: GroupMember) => {
                  const isHov = hoveredMember === member.user_id
                  return (
                    <div
                      key={member.user_id}
                      onMouseOver={() => setHoveredMember(member.user_id)}
                      onMouseOut={() => setHoveredMember(null)}
                      style={{
                        background: isHov ? "var(--bg-3)" : "var(--bg-2)",
                        padding: "16px 20px",
                        display: "flex", alignItems: "center", gap: "14px",
                        transition: "background 0.15s",
                      }}
                    >
                      {/* Avatar */}
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <div style={{
                          width: "36px", height: "36px", borderRadius: "50%",
                          background: "var(--bg-3)", display: "flex",
                          alignItems: "center", justifyContent: "center",
                          border: member.status === "studying" ? "2px solid var(--success)" : "2px solid transparent",
                          transition: "border-color 0.3s",
                        }}>
                          <span style={{ fontSize: "13px", color: "var(--text-2)", fontFamily: "DM Mono, monospace", textTransform: "uppercase" }}>
                            {member.username[0] || "?"}
                          </span>
                        </div>
                        {member.status !== "offline" && (
                          <div style={{
                            position: "absolute", bottom: 0, right: 0,
                            width: "10px", height: "10px", borderRadius: "50%",
                            background: statusDot(member.status),
                            border: "2px solid var(--bg-2)",
                          }} />
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <p style={{
                          color: member.status === "offline" ? "var(--text-3)" : "var(--text)",
                          fontSize: "13px", fontFamily: "DM Mono, monospace",
                        }}>
                          {member.username}
                          {member.user_id === group.created_by && (
                            <span style={{ color: "var(--text-3)", fontSize: "10px", marginLeft: "8px" }}>creator</span>
                          )}
                        </p>
                        {member.status === "studying" && member.current_topic && (
                          <p style={{ color: "var(--accent)", fontSize: "11px", fontFamily: "DM Mono, monospace", marginTop: "2px" }}>
                            locked in on {member.current_topic}
                          </p>
                        )}
                        {member.status === "online" && (
                          <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", marginTop: "2px" }}>
                            online
                          </p>
                        )}
                        {member.status === "offline" && (
                          <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", marginTop: "2px", fontStyle: "italic" }}>
                            offline
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── RIGHT: Ambient + Shared weak topics ───────────────────── */}
            <div>
              {/* Ambient player */}
              <div style={{ marginBottom: "24px" }}>
                <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
                  study room
                </p>
                <AmbientPlayer />

                {/* Who's locked in */}
                {activeMemberCount > 0 && (
                  <div style={{ marginTop: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <div style={{ display: "flex" }}>
                      {group.members
                        .filter(m => m.status === "studying" || m.status === "online")
                        .slice(0, 4)
                        .map((m, i) => (
                          <div
                            key={m.user_id}
                            style={{
                              width: "22px", height: "22px", borderRadius: "50%",
                              background: "var(--bg-3)", border: "2px solid var(--bg)",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              marginLeft: i > 0 ? "-6px" : "0", position: "relative", zIndex: 4 - i,
                            }}
                          >
                            <span style={{ fontSize: "8px", color: "var(--text-2)", fontFamily: "DM Mono, monospace", textTransform: "uppercase" }}>
                              {m.username[0]}
                            </span>
                          </div>
                        ))}
                    </div>
                    <span style={{ fontSize: "10px", color: "var(--text-3)", fontFamily: "DM Mono, monospace" }}>
                      {activeMemberCount === 1 ? "1 person" : `${activeMemberCount} people`} in the room
                    </span>
                  </div>
                )}
              </div>

              {/* Shared weak topics */}
              {weakTopics.length > 0 && (
                <div style={{ marginBottom: "24px" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
                    shared weak spots
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    {weakTopics.slice(0, 6).map(wt => (
                      <div
                        key={`${wt.topic}__${wt.course}`}
                        onClick={() => router.push(`/session?topic=${encodeURIComponent(wt.topic)}&course=${encodeURIComponent(wt.course)}&group=${groupId}`)}
                        style={{
                          background: "var(--bg-2)", padding: "12px 16px",
                          cursor: "pointer", transition: "background 0.15s",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}
                        onMouseOver={e => (e.currentTarget.style.background = "var(--bg-3)")}
                        onMouseOut={e => (e.currentTarget.style.background = "var(--bg-2)")}
                      >
                        <div style={{ minWidth: 0 }}>
                          <p style={{ color: "var(--text)", fontSize: "12px", fontFamily: "DM Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {wt.topic}
                          </p>
                          <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", marginTop: "2px" }}>
                            {wt.weak_count} of you need this
                          </p>
                        </div>
                        <span style={{ color: getScoreColor(wt.avg_score), fontSize: "13px", fontFamily: "DM Serif Display, serif", flexShrink: 0, paddingLeft: "12px" }}>
                          {wt.avg_score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invite friends to group */}
              {group.members.length < 6 && (
                <div style={{ marginBottom: "12px" }}>
                  <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "10px" }}>
                    invite
                  </p>

                  {!showInvitePanel ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <button
                        onClick={() => setShowInvitePanel(true)}
                        style={{
                          background: "var(--bg-2)", border: "1px solid var(--border)",
                          color: "var(--text-2)", padding: "10px 16px",
                          fontFamily: "DM Mono, monospace", fontSize: "11px",
                          cursor: "pointer", width: "100%", textAlign: "center",
                          transition: "all 0.15s",
                        }}
                        onMouseOver={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)" }}
                        onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)" }}
                      >
                        invite a friend
                      </button>
                      <button
                        onClick={copyInviteLink}
                        style={{
                          background: "none", border: "none",
                          color: copied ? "var(--success)" : "var(--text-3)",
                          padding: "6px", fontFamily: "DM Mono, monospace", fontSize: "10px",
                          cursor: "pointer", width: "100%", textAlign: "center",
                          transition: "color 0.2s",
                        }}
                      >
                        {copied ? "link copied!" : "or copy invite link"}
                      </button>
                    </div>
                  ) : (
                    <div style={{ background: "var(--bg-2)", border: "1px solid var(--border)", padding: "12px" }}>
                      {(() => {
                        const memberIds = group.members.map(m => m.user_id)
                        const invitable = myFriends.filter(f => !memberIds.includes(f.user_id))
                        if (invitable.length === 0) return (
                          <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", textAlign: "center", padding: "8px" }}>
                            {myFriends.length === 0 ? "add friends first" : "all friends already in group"}
                          </p>
                        )
                        return invitable.map(friend => (
                          <div
                            key={friend.user_id}
                            style={{
                              display: "flex", alignItems: "center", justifyContent: "space-between",
                              padding: "8px 4px", borderBottom: "1px solid var(--border)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <div style={{
                                width: "24px", height: "24px", borderRadius: "50%",
                                background: "var(--bg-3)", display: "flex",
                                alignItems: "center", justifyContent: "center",
                              }}>
                                <span style={{ fontSize: "9px", color: "var(--text-2)", fontFamily: "DM Mono, monospace", textTransform: "uppercase" }}>
                                  {friend.username[0]}
                                </span>
                              </div>
                              <span style={{ fontSize: "11px", fontFamily: "DM Mono, monospace", color: "var(--text-2)" }}>
                                {friend.username}
                              </span>
                            </div>
                            <button
                              onClick={async () => {
                                const result = await sendGroupInvite(groupId, userId, friend.user_id)
                                if (result.success) toast.success(`invited ${friend.username}`)
                                else toast.error(result.error || "failed")
                              }}
                              style={{
                                background: "none", border: "1px solid var(--border)",
                                color: "var(--text-2)", padding: "3px 10px",
                                fontFamily: "DM Mono, monospace", fontSize: "9px",
                                cursor: "pointer", transition: "all 0.15s",
                              }}
                              onMouseOver={e => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.color = "var(--accent)" }}
                              onMouseOut={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-2)" }}
                            >
                              invite
                            </button>
                          </div>
                        ))
                      })()}
                      <button
                        onClick={() => setShowInvitePanel(false)}
                        style={{
                          background: "none", border: "none", color: "var(--text-3)",
                          fontFamily: "DM Mono, monospace", fontSize: "10px",
                          cursor: "pointer", marginTop: "8px", padding: 0,
                          width: "100%", textAlign: "center",
                        }}
                      >
                        close
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Leave group */}
              <button
                onClick={handleLeave}
                style={{
                  background: "none", border: "1px solid var(--border)",
                  color: "var(--text-3)", padding: "8px 16px",
                  fontFamily: "DM Mono, monospace", fontSize: "10px",
                  cursor: "pointer", letterSpacing: "0.05em",
                  transition: "color 0.2s, border-color 0.2s",
                  width: "100%",
                }}
                onMouseOver={e => { e.currentTarget.style.color = "var(--danger)"; e.currentTarget.style.borderColor = "var(--danger)" }}
                onMouseOut={e => { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.borderColor = "var(--border)" }}
              >
                leave group
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              LOCK IN TOGETHER CTA
              ═══════════════════════════════════════════════════════════ */}
          <button
            onClick={() => {
              const topic = weakTopics.length > 0 ? weakTopics[0].topic : ""
              const params = new URLSearchParams({ course: group.course, group: groupId })
              if (topic) params.set("topic", topic)
              router.push(`/session?${params.toString()}`)
            }}
            style={{
              background: "var(--text)", color: "var(--bg)", border: "none",
              padding: "18px 40px", fontFamily: "DM Mono, monospace", fontSize: "13px",
              cursor: "pointer", letterSpacing: "0.08em", textTransform: "uppercase",
              transition: "opacity 0.2s", width: "100%",
            }}
            onMouseOver={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseOut={e => (e.currentTarget.style.opacity = "1")}
          >
            lock in together
          </button>
          {activeMemberCount > 0 && (
            <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", textAlign: "center", marginTop: "8px" }}>
              {activeMemberCount} {activeMemberCount === 1 ? "member is" : "members are"} studying right now
            </p>
          )}

        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
