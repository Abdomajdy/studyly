"use client"
import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { getMastery } from "@/services/mastery.service"
import { getFriends, getMyGroups, getPendingFriendRequests, getPendingGroupInvites } from "@/services/social.service"
import type { FriendWithPresence, StudyGroupSummary } from "@/lib/helpers"
import type { FriendRequest, GroupInvite } from "@/services/social.service"

export type SidebarData = {
  stats: {
    totalSessions: number
    masteryCount: number
    weakCount: number
    avgMastery: number | null
  }
  friends: FriendWithPresence[]
  groups: StudyGroupSummary[]
  pendingCount: number
  userId: string | null
  loading: boolean
}

export function useSidebarData(): SidebarData {
  const router = useRouter()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalSessions: 0, masteryCount: 0, weakCount: 0, avgMastery: null as number | null,
  })
  const [friends, setFriends] = useState<FriendWithPresence[]>([])
  const [groups, setGroups] = useState<StudyGroupSummary[]>([])
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push("/login"); return }
      setUserId(user.id)

      const [masteryData, { count }, friendsData, groupsData, requests, invites] = await Promise.all([
        getMastery(user.id),
        supabase.from("study_sessions").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        getFriends(user.id),
        getMyGroups(user.id),
        getPendingFriendRequests(user.id),
        getPendingGroupInvites(user.id),
      ])

      const scores = masteryData.map(m => m.score)
      setStats({
        totalSessions: count ?? 0,
        masteryCount: scores.length,
        weakCount: scores.filter(s => s < 40).length,
        avgMastery: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      })
      setFriends(friendsData)
      setGroups(groupsData)
      setPendingCount(requests.length + invites.length)
      setLoading(false)
    }
    load()
  }, [router])

  return { stats, friends, groups, pendingCount, userId, loading }
}
