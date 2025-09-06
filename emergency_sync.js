const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://ulzwkdkpxscbygcvdwvj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1aWZwdXRsampjdnRlcm1pbmVhcXUiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzM2MzAzNDk2LCJleHAiOjIwNTE4Nzk0OTZ9.Qk_8Lz0CzCcGT3Tn-_vQKHjl6fUBGDsHSNMfH8uGH6Q'
);

async function emergencySync() {
  console.log('🚨 EMERGENCY SYNC: Starting direct database update...');
  
  const phoneDeviceId = '720E60D4-6E83-4725-AB51-94F20C40F03A';
  const userId = '28b13687-d7df-4af7-babc-2010042f2319';
  
  try {
    // Update all phone openers to user_id
    console.log('📊 Updating openers...');
    const { data: openers, error: openerError } = await supabase
      .from('openers')
      .update({ user_id: userId })
      .eq('device_id', phoneDeviceId)
      .is('user_id', null)
      .select();
    
    if (openerError) {
      console.error('❌ Opener update failed:', openerError);
    } else {
      console.log(`✅ Updated ${openers?.length || 0} openers`);
    }
    
    // Update all phone challenges to user_id
    console.log('📊 Updating challenges...');
    const { data: challenges, error: challengeError } = await supabase
      .from('daily_challenges')
      .update({ user_id: userId })
      .eq('device_id', phoneDeviceId)
      .is('user_id', null)
      .select();
    
    if (challengeError) {
      console.error('❌ Challenge update failed:', challengeError);
    } else {
      console.log(`✅ Updated ${challenges?.length || 0} challenges`);
    }
    
    console.log('🚨 EMERGENCY SYNC COMPLETE!');
    console.log(`📊 Total synced: ${(openers?.length || 0) + (challenges?.length || 0)} records`);
    
  } catch (error) {
    console.error('❌ Emergency sync failed:', error);
  }
}

emergencySync();
