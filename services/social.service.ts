import { supabase } from "@/lib/supabase"
import type { FriendWithPresence, StudyGroupSummary } from "@/lib/helpers"

// ── Types (internal) ────────────────────────────────────────────────────────
export type GroupMember = {
  user_id: string
  username: string
  status: "online" | "studying" | "idle" | "offline"
  current_topic: string | null
  current_course: string | null
  joined_at: string
}

export type GroupDetail = {
  id: string
  name: string
  course: string
  created_by: string
  members: GroupMember[]
}

export type SharedWeakTopic = {
  topic: string
  course: string
  avg_score: number
  weak_count: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const STALE_MINUTES = 5

function isOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false
  return (Date.now() - new Date(lastSeen).getTime()) < STALE_MINUTES * 60 * 1000
}

// Supabase sometimes returns {} or objects with empty message as "errors"
// This helper ignores those non-errors
function isRealError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as Record<string, unknown>
  if (Object.keys(e).length === 0) return false
  if ("message" in e && typeof e.message === "string" && e.message.length > 0) return true
  if ("code" in e && e.code) return true
  return false
}

function resolveStatus(row: { status?: string; last_seen?: string } | null): "online" | "studying" | "idle" | "offline" {
  if (!row || !isOnline(row.last_seen ?? null)) return "offline"
  const s = row.status
  if (s === "studying") return "studying"
  if (s === "idle") return "idle"
  return "online"
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // no ambiguous chars
  let code = ""
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

// ═══════════════════════════════════════════════════════════════════════════
// FRIEND REQUESTS (username-based)
// ═══════════════════════════════════════════════════════════════════════════

export type FriendRequest = {
  id: string
  sender_id: string
  sender_username: string
  created_at: string
}

export type GroupInvite = {
  id: string
  group_id: string
  group_name: string
  group_course: string
  invited_by_username: string
  created_at: string
}

export async function searchUsers(query: string, currentUserId: string): Promise<{ id: string; username: string }[]> {
  try {
    if (query.trim().length < 2) return []
    const { data, error } = await supabase
      .from("profiles")
      .select("id, username")
      .ilike("username", `%${query.trim()}%`)
      .neq("id", currentUserId)
      .limit(8)
    if (isRealError(error)) { console.error("[searchUsers]", error); return [] }
    return data || []
  } catch (err) {
    console.error("[searchUsers] unexpected:", err)
    return []
  }
}

export async function sendFriendRequest(fromUserId: string, toUserId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check not already friends
    const { data: existing } = await supabase
      .from("friendships")
      .select("id")
      .or(`and(user_a.eq.${fromUserId},user_b.eq.${toUserId}),and(user_a.eq.${toUserId},user_b.eq.${fromUserId})`)
      .limit(1)
    if (existing && existing.length > 0) return { success: false, error: "already friends" }

    // Check no pending request exists
    const { data: pendingExisting } = await supabase
      .from("friend_requests")
      .select("id")
      .or(`and(sender_id.eq.${fromUserId},receiver_id.eq.${toUserId}),and(sender_id.eq.${toUserId},receiver_id.eq.${fromUserId})`)
      .eq("status", "pending")
      .limit(1)
    if (pendingExisting && pendingExisting.length > 0) return { success: false, error: "request already sent" }

    const { error } = await supabase.from("friend_requests").insert({
      sender_id: fromUserId,
      receiver_id: toUserId,
      status: "pending",
    })
    if (isRealError(error)) { console.error("[sendFriendRequest]", error); return { success: false, error: "failed to send" } }
    return { success: true }
  } catch (err) {
    console.error("[sendFriendRequest] unexpected:", err)
    return { success: false, error: "unexpected error" }
  }
}

export async function getPendingFriendRequests(userId: string): Promise<FriendRequest[]> {
  try {
    const { data, error } = await supabase
      .from("friend_requests")
      .select("id, sender_id, created_at")
      .eq("receiver_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
    if (isRealError(error)) { console.error("[getPendingFriendRequests]", error); return [] }
    if (!data || data.length === 0) return []

    // Get sender usernames
    const senderIds = data.map(r => r.sender_id)
    const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", senderIds)
    const nameMap: Record<string, string> = {}
    if (profiles) profiles.forEach(p => { nameMap[p.id] = p.username || "anon" })

    return data.map(r => ({
      id: r.id,
      sender_id: r.sender_id,
      sender_username: nameMap[r.sender_id] || "anon",
      created_at: r.created_at,
    }))
  } catch (err) {
    console.error("[getPendingFriendRequests] unexpected:", err)
    return []
  }
}

export async function respondToFriendRequest(
  requestId: string,
  userId: string,
  accept: boolean,
): Promise<boolean> {
  try {
    if (accept) {
      // Get the request
      const { data: req, error: getErr } = await supabase
        .from("friend_requests")
        .select("sender_id, receiver_id")
        .eq("id", requestId)
        .eq("receiver_id", userId)
        .single()
      if (getErr || !req) { console.error("[respondToFriendRequest] not found"); return false }

      // Create friendship
      const { error: fErr } = await supabase.from("friendships").insert({
        user_a: req.sender_id,
        user_b: req.receiver_id,
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      if (fErr) { console.error("[respondToFriendRequest] friendship:", JSON.stringify(fErr)); return false }
    }

    // Update request status
    const { error } = await supabase
      .from("friend_requests")
      .update({ status: accept ? "accepted" : "declined" })
      .eq("id", requestId)
    if (isRealError(error)) { console.error("[respondToFriendRequest]", error); return false }
    return true
  } catch (err) {
    console.error("[respondToFriendRequest] unexpected:", err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GROUP INVITES
// ═══════════════════════════════════════════════════════════════════════════

export async function sendGroupInvite(
  groupId: string,
  invitedByUserId: string,
  invitedUserId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if already a member
    const { data: existing } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", invitedUserId)
      .limit(1)
    if (existing && existing.length > 0) return { success: false, error: "already a member" }

    // Check no pending invite
    const { data: pendingExisting } = await supabase
      .from("group_invites")
      .select("id")
      .eq("group_id", groupId)
      .eq("invited_user_id", invitedUserId)
      .eq("status", "pending")
      .limit(1)
    if (pendingExisting && pendingExisting.length > 0) return { success: false, error: "invite already sent" }

    const { error } = await supabase.from("group_invites").insert({
      group_id: groupId,
      invited_by: invitedByUserId,
      invited_user_id: invitedUserId,
      status: "pending",
    })
    if (isRealError(error)) { console.error("[sendGroupInvite]", error); return { success: false, error: "failed to send" } }
    return { success: true }
  } catch (err) {
    console.error("[sendGroupInvite] unexpected:", err)
    return { success: false, error: "unexpected error" }
  }
}

export async function getPendingGroupInvites(userId: string): Promise<GroupInvite[]> {
  try {
    const { data, error } = await supabase
      .from("group_invites")
      .select("id, group_id, invited_by, created_at")
      .eq("invited_user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
    if (isRealError(error)) { console.error("[getPendingGroupInvites]", error); return [] }
    if (!data || data.length === 0) return []

    // Get group info + inviter names
    const groupIds = [...new Set(data.map(d => d.group_id))]
    const inviterIds = [...new Set(data.map(d => d.invited_by))]

    const [{ data: groups }, { data: profiles }] = await Promise.all([
      supabase.from("study_groups").select("id, name, course").in("id", groupIds),
      supabase.from("profiles").select("id, username").in("id", inviterIds),
    ])

    const groupMap: Record<string, { name: string; course: string }> = {}
    if (groups) groups.forEach(g => { groupMap[g.id] = { name: g.name, course: g.course } })
    const nameMap: Record<string, string> = {}
    if (profiles) profiles.forEach(p => { nameMap[p.id] = p.username || "anon" })

    return data.map(d => ({
      id: d.id,
      group_id: d.group_id,
      group_name: groupMap[d.group_id]?.name || "unknown",
      group_course: groupMap[d.group_id]?.course || "",
      invited_by_username: nameMap[d.invited_by] || "anon",
      created_at: d.created_at,
    }))
  } catch (err) {
    console.error("[getPendingGroupInvites] unexpected:", err)
    return []
  }
}

export async function respondToGroupInvite(
  inviteId: string,
  userId: string,
  accept: boolean,
): Promise<boolean> {
  try {
    if (accept) {
      const { data: invite, error: getErr } = await supabase
        .from("group_invites")
        .select("group_id")
        .eq("id", inviteId)
        .eq("invited_user_id", userId)
        .single()
      if (getErr || !invite) { console.error("[respondToGroupInvite] not found"); return false }

      // Add to group
      const { error: mErr } = await supabase.from("group_members").insert({
        group_id: invite.group_id,
        user_id: userId,
      })
      if (isRealError(mErr)) { console.error("[respondToGroupInvite] member:", mErr); return false }
    }

    const { error } = await supabase
      .from("group_invites")
      .update({ status: accept ? "accepted" : "declined" })
      .eq("id", inviteId)
    if (isRealError(error)) { console.error("[respondToGroupInvite]", error); return false }
    return true
  } catch (err) {
    console.error("[respondToGroupInvite] unexpected:", err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FRIENDS
// ═══════════════════════════════════════════════════════════════════════════

export async function getFriends(userId: string): Promise<FriendWithPresence[]> {
  try {
    const { data: friendships, error } = await supabase
      .from("friendships")
      .select("id, user_a, user_b, status")
      .eq("status", "accepted")
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    if (isRealError(error)) { console.error("[getFriends]", error); return [] }
    if (!friendships) return []

    const friendIds = friendships.map(f => f.user_a === userId ? f.user_b : f.user_a)
    if (friendIds.length === 0) return []

    // Get profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", friendIds)
    const profileMap: Record<string, string> = {}
    if (profiles) profiles.forEach(p => { profileMap[p.id] = p.username || "anon" })

    // Get presence
    const { data: presenceRows } = await supabase
      .from("presence")
      .select("user_id, status, current_topic, current_course, last_seen")
      .in("user_id", friendIds)
    const presenceMap: Record<string, { status: string; current_topic: string | null; current_course: string | null; last_seen: string }> = {}
    if (presenceRows) presenceRows.forEach(p => { presenceMap[p.user_id] = p })

    const friends: FriendWithPresence[] = friendships.map(f => {
      const fid = f.user_a === userId ? f.user_b : f.user_a
      const pres = presenceMap[fid] || null
      return {
        id: f.id,
        user_id: fid,
        username: profileMap[fid] || "anon",
        status: resolveStatus(pres),
        current_topic: pres?.current_topic ?? null,
        current_course: pres?.current_course ?? null,
      }
    })

    // Sort: studying first, online, idle, offline
    const order = { studying: 0, online: 1, idle: 2, offline: 3 }
    friends.sort((a, b) => order[a.status] - order[b.status])
    return friends
  } catch (err) {
    console.error("[getFriends] unexpected:", err)
    return []
  }
}

export async function removeFriend(userId: string, friendshipId: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("friendships").delete().eq("id", friendshipId)
    if (isRealError(error)) { console.error("[removeFriend]", error); return false }
    return true
  } catch (err) {
    console.error("[removeFriend] unexpected:", err)
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STUDY GROUPS
// ═══════════════════════════════════════════════════════════════════════════

export async function createGroup(userId: string, name: string, course: string): Promise<string | null> {
  try {
    // Generate ID client-side to avoid RLS issue on .select() after insert
    const groupId = crypto.randomUUID()
    const { error: gErr } = await supabase
      .from("study_groups")
      .insert({ id: groupId, name: name.trim(), course: course.trim(), created_by: userId })
    if (gErr) { console.error("[createGroup] group insert:", JSON.stringify(gErr)); return null }

    // Add creator as first member
    const { error: mErr } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: userId,
    })
    if (mErr) { console.error("[createGroup] member insert:", JSON.stringify(mErr)); return null }

    // Verify the insert actually persisted (RLS can silently drop rows)
    const { data: verify } = await supabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .single()
    if (!verify) {
      console.error("[createGroup] insert succeeded but row not readable — check RLS policies")
      return null
    }

    return groupId
  } catch (err) {
    console.error("[createGroup] unexpected:", err)
    return null
  }
}

export async function getMyGroups(userId: string): Promise<StudyGroupSummary[]> {
  try {
    // Get group IDs user belongs to
    const { data: memberships, error: mErr } = await supabase
      .from("group_members")
      .select("group_id")
      .eq("user_id", userId)
    if (mErr) { console.error("[getMyGroups] memberships error:", JSON.stringify(mErr)); return [] }
    console.log("[getMyGroups] memberships:", memberships)
    if (!memberships || memberships.length === 0) return []

    const groupIds = memberships.map(m => m.group_id)
    if (groupIds.length === 0) return []

    // Get group details
    const { data: groups } = await supabase
      .from("study_groups")
      .select("id, name, course")
      .in("id", groupIds)
    if (!groups) return []

    // Get all members for these groups
    const { data: allMembers } = await supabase
      .from("group_members")
      .select("group_id, user_id")
      .in("group_id", groupIds)

    // Get presence for all members
    const allMemberIds = [...new Set((allMembers || []).map(m => m.user_id))]
    const { data: presenceRows } = await supabase
      .from("presence")
      .select("user_id, status, last_seen")
      .in("user_id", allMemberIds)
    const presenceMap: Record<string, { status: string; last_seen: string }> = {}
    if (presenceRows) presenceRows.forEach(p => { presenceMap[p.user_id] = p })

    return groups.map(g => {
      const members = (allMembers || []).filter(m => m.group_id === g.id)
      const onlineCount = members.filter(m => {
        const pres = presenceMap[m.user_id]
        return pres && isOnline(pres.last_seen) && (pres.status === "online" || pres.status === "studying")
      }).length

      return {
        id: g.id,
        name: g.name,
        course: g.course,
        member_count: members.length,
        online_count: onlineCount,
      }
    })
  } catch (err) {
    console.error("[getMyGroups] unexpected:", err)
    return []
  }
}

export async function getGroupDetail(groupId: string): Promise<GroupDetail | null> {
  try {
    const { data: group, error: gErr } = await supabase
      .from("study_groups")
      .select("id, name, course, created_by")
      .eq("id", groupId)
      .single()
    if (gErr || !group) { console.error("[getGroupDetail]", gErr); return null }

    const { data: members } = await supabase
      .from("group_members")
      .select("user_id, joined_at")
      .eq("group_id", groupId)
    if (!members) return { ...group, members: [] }

    const memberIds = members.map(m => m.user_id)

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, username")
      .in("id", memberIds)
    const profileMap: Record<string, string> = {}
    if (profiles) profiles.forEach(p => { profileMap[p.id] = p.username || "anon" })

    const { data: presenceRows } = await supabase
      .from("presence")
      .select("user_id, status, current_topic, current_course, last_seen")
      .in("user_id", memberIds)
    const presenceMap: Record<string, { status: string; current_topic: string | null; current_course: string | null; last_seen: string }> = {}
    if (presenceRows) presenceRows.forEach(p => { presenceMap[p.user_id] = p })

    return {
      ...group,
      members: members.map(m => ({
        user_id: m.user_id,
        username: profileMap[m.user_id] || "anon",
        status: resolveStatus(presenceMap[m.user_id] || null),
        current_topic: presenceMap[m.user_id]?.current_topic ?? null,
        current_course: presenceMap[m.user_id]?.current_course ?? null,
        joined_at: m.joined_at,
      })),
    }
  } catch (err) {
    console.error("[getGroupDetail] unexpected:", err)
    return null
  }
}

export async function joinGroup(userId: string, groupId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Check member count
    const { count, error: cErr } = await supabase
      .from("group_members")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
    if (isRealError(cErr)) { console.error("[joinGroup]", cErr); return { success: false, error: "failed to check group" } }
    if ((count ?? 0) >= 6) return { success: false, error: "group is full (max 6)" }

    const { error } = await supabase.from("group_members").insert({ group_id: groupId, user_id: userId })
    if (error && isRealError(error)) {
      if (error.code === "23505") return { success: false, error: "already a member" }
      console.error("[joinGroup]", error)
      return { success: false, error: "failed to join" }
    }
    return { success: true }
  } catch (err) {
    console.error("[joinGroup] unexpected:", err)
    return { success: false, error: "unexpected error" }
  }
}

export async function leaveGroup(userId: string, groupId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId)
    if (isRealError(error)) { console.error("[leaveGroup]", error); return false }
    return true
  } catch (err) {
    console.error("[leaveGroup] unexpected:", err)
    return false
  }
}

export async function getGroupWeakTopics(groupId: string): Promise<SharedWeakTopic[]> {
  try {
    // Get member IDs
    const { data: members } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
    if (!members || members.length === 0) return []

    const memberIds = members.map(m => m.user_id)

    // Get all mastery rows for members
    const { data: masteryRows } = await supabase
      .from("topic_mastery")
      .select("user_id, topic, course, score")
      .in("user_id", memberIds)
    if (!masteryRows) return []

    // Group by topic+course, find shared weak spots
    const topicMap: Record<string, { scores: number[]; course: string }> = {}
    masteryRows.forEach(row => {
      const key = `${row.topic}__${row.course}`
      if (!topicMap[key]) topicMap[key] = { scores: [], course: row.course }
      topicMap[key].scores.push(row.score)
    })

    const sharedWeak: SharedWeakTopic[] = []
    Object.entries(topicMap).forEach(([key, val]) => {
      const weakScores = val.scores.filter(s => s < 50)
      if (weakScores.length >= 2) {
        sharedWeak.push({
          topic: key.split("__")[0],
          course: val.course,
          avg_score: Math.round(val.scores.reduce((a, b) => a + b, 0) / val.scores.length),
          weak_count: weakScores.length,
        })
      }
    })

    return sharedWeak.sort((a, b) => b.weak_count - a.weak_count)
  } catch (err) {
    console.error("[getGroupWeakTopics] unexpected:", err)
    return []
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESENCE
// ═══════════════════════════════════════════════════════════════════════════

export async function updatePresence(
  userId: string,
  status: "online" | "studying" | "idle",
  topic?: string,
  course?: string,
  groupId?: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("presence")
      .upsert({
        user_id: userId,
        status,
        current_topic: topic || null,
        current_course: course || null,
        group_id: groupId || null,
        last_seen: new Date().toISOString(),
      }, { onConflict: "user_id" })
    if (isRealError(error)) console.error("[updatePresence]", error)
  } catch (err) {
    console.error("[updatePresence] unexpected:", err)
  }
}

export async function clearPresence(userId: string): Promise<void> {
  try {
    const { error } = await supabase.from("presence").delete().eq("user_id", userId)
    if (isRealError(error)) console.error("[clearPresence]", error)
  } catch (err) {
    console.error("[clearPresence] unexpected:", err)
  }
}
