import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller identity
    const supabaseUser = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user: caller }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'ไม่ได้รับอนุญาต' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service_role for all DB operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch caller profile to check system_role
    const { data: callerProfile, error: callerErr } = await supabaseAdmin
      .from('profiles')
      .select('system_role')
      .eq('id', caller.id)
      .maybeSingle();

    if (callerErr || !callerProfile) {
      return new Response(JSON.stringify({ error: 'ไม่พบข้อมูลผู้เรียก' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!['super_admin', 'admin'].includes(callerProfile.system_role)) {
      return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์แอดมิน' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { user_id, nickname, ic_name, system_role } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ error: 'ต้องระบุ user_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch target profile to enforce privilege rules
    const { data: targetProfile } = await supabaseAdmin
      .from('profiles')
      .select('system_role')
      .eq('id', user_id)
      .maybeSingle();

    if (!targetProfile) {
      return new Response(JSON.stringify({ error: 'ไม่พบผู้ใช้' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only super_admin can edit another super_admin
    if (
      targetProfile.system_role === 'super_admin' &&
      callerProfile.system_role !== 'super_admin'
    ) {
      return new Response(JSON.stringify({ error: 'ไม่สามารถแก้ไข Super Admin ได้' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build update payload (only include fields that were provided)
    const updates: Record<string, string | null> = {};
    if (Object.prototype.hasOwnProperty.call(body, 'nickname')) {
      updates.nickname = nickname?.trim() || null;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'ic_name')) {
      updates.ic_name = ic_name?.trim() || null;
    }
    if (
      Object.prototype.hasOwnProperty.call(body, 'system_role') &&
      system_role &&
      callerProfile.system_role === 'super_admin'
    ) {
      // Only super_admin can change system_role
      updates.system_role = system_role;
    }

    if (Object.keys(updates).length === 0) {
      return new Response(JSON.stringify({ error: 'ไม่มีข้อมูลที่จะอัปเดต' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data, error: updateError } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', user_id)
      .select()
      .maybeSingle();

    if (updateError) {
      return new Response(JSON.stringify({ error: 'อัปเดตข้อมูลไม่สำเร็จ: ' + updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, profile: data }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
