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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('system_role')
      .eq('id', caller.id)
      .maybeSingle();

    if (!callerProfile || !['super_admin', 'admin'].includes(callerProfile.system_role)) {
      return new Response(JSON.stringify({ error: 'ต้องการสิทธิ์แอดมิน' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { role_id } = await req.json();
    if (!role_id) {
      return new Response(JSON.stringify({ error: 'ต้องระบุ role_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Remove all related records in dependency order
    // 1. Remove this role from role_criteria.next_role_id references
    await supabaseAdmin
      .from('role_criteria')
      .update({ next_role_id: null })
      .eq('next_role_id', role_id);

    // 2. Remove user_roles for this role
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('role_id', role_id);

    // 3. Remove role_permissions
    await supabaseAdmin
      .from('role_permissions')
      .delete()
      .eq('role_id', role_id);

    // 4. Remove role_criteria
    await supabaseAdmin
      .from('role_criteria')
      .delete()
      .eq('role_id', role_id);

    // 5. Finally delete the role
    const { error: deleteError } = await supabaseAdmin
      .from('roles')
      .delete()
      .eq('id', role_id);

    if (deleteError) {
      return new Response(JSON.stringify({ error: 'ลบยศไม่สำเร็จ: ' + deleteError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
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
