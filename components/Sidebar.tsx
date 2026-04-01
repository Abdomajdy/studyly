"use client"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import type { FriendWithPresence, StudyGroupSummary } from "@/lib/helpers"

type SidebarProps = {
  activePage: "dashboard" | "sessions" | "past-papers" | "analytics" | "patterns" | "settings" | "groups"
  stats: {
    totalSessions: number
    masteryCount: number
    weakCount: number
    avgMastery: number | null
  }
  friends?: FriendWithPresence[]
  groups?: StudyGroupSummary[]
  pendingCount?: number
  onAddFriend?: () => void
  onCreateGroup?: () => void
}

const NAV_ITEMS: { key: SidebarProps["activePage"]; label: string; href: string }[] = [
  { key: "dashboard",    label: "dashboard",    href: "/dashboard" },
  { key: "sessions",     label: "sessions",     href: "/sessions" },
  { key: "past-papers",  label: "past papers",  href: "/past-papers" },
  { key: "analytics",    label: "analytics",    href: "/analytics" },
  { key: "patterns",     label: "my patterns",  href: "/patterns" },
  { key: "settings",     label: "settings",     href: "/settings" },
]

function getScoreColor(score: number): string {
  if (score >= 70) return "var(--success)"
  if (score >= 40) return "var(--accent)"
  return "var(--danger)"
}

function statusColor(status: string): string {
  if (status === "studying") return "var(--success)"
  if (status === "online") return "var(--success)"
  if (status === "idle") return "var(--accent)"
  return "var(--text-3)"
}

export default function Sidebar({ activePage, stats, friends = [], groups = [], pendingCount = 0, onAddFriend, onCreateGroup }: SidebarProps) {
  const router = useRouter()

  return (
    <div style={{ width: "260px", minHeight: "100vh", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto" }}>

      {/* Logo */}
      <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid var(--border)" }}>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: "15px", letterSpacing: "0.05em", color: "var(--text)" }}>
          stud<span style={{ color: "var(--accent)" }}>i</span>ly
        </span>
      </div>

      {/* Nav */}
      <div style={{ padding: "16px 12px", borderBottom: "1px solid var(--border)" }}>
        {NAV_ITEMS.map(item => {
          const isActive = item.key === activePage
          return (
            <div
              key={item.key}
              onClick={() => !isActive && router.push(item.href)}
              style={{
                padding: "10px 12px",
                background: isActive ? "var(--bg-2)" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "2px",
                cursor: isActive ? "default" : "pointer",
                transition: "background 0.15s ease",
              }}
              onMouseOver={e => { if (!isActive) e.currentTarget.style.background = "var(--bg-2)" }}
              onMouseOut={e => { if (!isActive) e.currentTarget.style.background = "transparent" }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-3)" }}>
                {isActive ? "◆" : "○"}
              </span>
              <span style={{
                fontSize: "13px",
                fontFamily: "DM Mono, monospace",
                letterSpacing: "0.03em",
                color: isActive ? "var(--text)" : "var(--text-2)",
              }}>
                {item.label}
              </span>
            </div>
          )
        })}
      </div>

      {/* ── Study Groups ─────────────────────────────────────────────── */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase" }}>study groups</p>
          <button
            onClick={onCreateGroup}
            style={{
              background: "none", border: "none", color: "var(--text-3)",
              fontSize: "14px", cursor: "pointer", padding: "0 2px",
              transition: "color 0.15s", lineHeight: 1,
            }}
            onMouseOver={e => (e.currentTarget.style.color = "var(--accent)")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
            title="Create or join a group"
          >
            +
          </button>
        </div>

        {groups.length === 0 ? (
          <div style={{ border: "1px dashed var(--border)", padding: "16px 14px", textAlign: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", lineHeight: 1.6 }}>
              no groups yet
            </p>
            <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", marginTop: "4px", fontStyle: "italic" }}>
              create one to study together
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {groups.map(group => (
              <div
                key={group.id}
                onClick={() => router.push(`/groups?id=${group.id}`)}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "8px 10px", cursor: "pointer",
                  transition: "background 0.15s", background: "transparent",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "var(--bg-2)")}
                onMouseOut={e => (e.currentTarget.style.background = "transparent")}
              >
                <div style={{
                  width: "8px", height: "8px", borderRadius: "50%",
                  background: group.online_count > 0 ? "var(--success)" : "var(--border)",
                  transition: "background 0.3s",
                }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    fontSize: "12px", fontFamily: "DM Mono, monospace", color: "var(--text-2)",
                    display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {group.name}
                  </span>
                </div>
                <span style={{ fontSize: "10px", color: "var(--text-3)", fontFamily: "DM Mono, monospace", flexShrink: 0 }}>
                  {group.online_count > 0 ? `${group.online_count}/${group.member_count}` : group.member_count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Friends ──────────────────────────────────────────────────── */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase" }}>friends</p>
          <button
            onClick={onAddFriend}
            style={{
              background: "none", border: "none", color: "var(--text-3)",
              fontSize: "14px", cursor: "pointer", padding: "0 2px",
              transition: "color 0.15s", lineHeight: 1, position: "relative",
            }}
            onMouseOver={e => (e.currentTarget.style.color = "var(--accent)")}
            onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
            title="Add a friend"
          >
            +
            {pendingCount > 0 && (
              <span style={{
                position: "absolute", top: -4, right: -6,
                width: "14px", height: "14px", borderRadius: "50%",
                background: "var(--accent)", color: "var(--bg)",
                fontSize: "8px", fontFamily: "DM Mono, monospace",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700,
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        </div>

        {friends.length === 0 ? (
          <div style={{ border: "1px dashed var(--border)", padding: "16px 14px", textAlign: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "11px", fontFamily: "DM Mono, monospace", lineHeight: 1.6 }}>
              no friends added
            </p>
            <p style={{ color: "var(--text-3)", fontSize: "10px", fontFamily: "DM Mono, monospace", marginTop: "4px", fontStyle: "italic" }}>
              invite classmates to study together
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            {friends.map(friend => (
              <div
                key={friend.id}
                style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "8px 10px", transition: "background 0.15s", background: "transparent",
                }}
                onMouseOver={e => (e.currentTarget.style.background = "var(--bg-2)")}
                onMouseOut={e => (e.currentTarget.style.background = "transparent")}
              >
                {/* Avatar with status dot */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: "26px", height: "26px", borderRadius: "50%",
                    background: "var(--bg-3)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: "10px", color: "var(--text-2)", fontFamily: "DM Mono, monospace", textTransform: "uppercase" }}>
                      {friend.username[0] || "?"}
                    </span>
                  </div>
                  {friend.status !== "offline" && (
                    <div style={{
                      position: "absolute", bottom: -1, right: -1,
                      width: "8px", height: "8px", borderRadius: "50%",
                      background: statusColor(friend.status),
                      border: "2px solid var(--bg)",
                    }} />
                  )}
                </div>

                {/* Name + studying indicator */}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{
                    fontSize: "12px", fontFamily: "DM Mono, monospace",
                    color: friend.status === "offline" ? "var(--text-3)" : "var(--text-2)",
                    display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {friend.username}
                  </span>
                  {friend.status === "studying" && friend.current_topic && (
                    <span style={{
                      fontSize: "9px", color: "var(--accent)", fontFamily: "DM Mono, monospace",
                      display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      studying {friend.current_topic}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--border)" }}>
        <p style={{ color: "var(--text-3)", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "14px" }}>stats</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>sessions</p>
            <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{stats.totalSessions}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>topics tracked</p>
            <p style={{ color: "var(--text-2)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{stats.masteryCount}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>weak topics</p>
            <p style={{ color: "var(--danger)", fontSize: "13px", fontFamily: "DM Serif Display, serif" }}>{stats.weakCount}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={{ color: "var(--text-3)", fontSize: "12px" }}>avg mastery</p>
            <p style={{
              fontSize: "13px", fontFamily: "DM Serif Display, serif",
              color: stats.avgMastery != null ? getScoreColor(stats.avgMastery) : "var(--text-3)",
            }}>
              {stats.avgMastery ?? "\u2014"}
            </p>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <div style={{ marginTop: "auto", padding: "20px 24px" }}>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push("/login") }}
          style={{ background: "none", border: "none", color: "var(--text-3)", fontFamily: "DM Mono, monospace", fontSize: "12px", cursor: "pointer", letterSpacing: "0.05em", transition: "color 0.2s", padding: 0 }}
          onMouseOver={e => (e.currentTarget.style.color = "var(--text-2)")}
          onMouseOut={e => (e.currentTarget.style.color = "var(--text-3)")}
        >sign out</button>
      </div>
    </div>
  )
}
