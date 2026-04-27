"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { ChatRoom } from "@/components/chat/ChatRoom";

export default function ChatPage() {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{
    id: string;
    gender: string;
    seeking: string;
  } | null>(null);

  useEffect(() => {
    async function checkAuth() {
      // Use getUser() to validate JWT with Supabase servers (more secure than getSession)
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        router.push("/");
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, gender, seeking")
        .eq("id", user.id)
        .maybeSingle();

      if (error || !data) {
        console.error("Profile not found or error:", error);
        router.push("/");
        return;
      }

      setProfile(data);
      setLoading(false);
    }

    checkAuth();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-stone-950 text-stone-400">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <p className="text-sm font-medium tracking-wide">Initializing secure session…</p>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <ChatRoom
      userId={profile.id}
      gender={profile.gender}
      seeking={profile.seeking}
    />
  );
}
