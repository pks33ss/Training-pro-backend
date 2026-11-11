require('dotenv').config({ path: 'C:/JJ/Apps/training-pro/backend/.env' });

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { UserService } = require('./dist/user/user.service');

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL no está definida.');
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  const svc = new UserService(prisma, {
    sendInvitationEmail: async () => ({ sent: false }),
  });

  const me = await svc.getMe('cmu0cs6dr000258v4y9rz4cvh');
  const json = JSON.stringify(me);

 

  // ── Desglose de bytes por campo ──
  const bytesOf = (v) => Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');


  const scalarKeys = [
    'id', 'email', 'username', 'name', 'lastName', 'phone', 'avatar', 'bio',
    'role', 'isGhost', 'createdAt', 'emailNotificationsEnabled', 'emailOptOut',
    'tacticalBackgroundUrlHalf', 'tacticalBackgroundUrlFull',
    'tacticalBackgroundMode', 'hiddenTabs',
  ];
  for (const k of scalarKeys) {
    
  }



  if (me.memberships[0]) {
    const m = me.memberships[0];
  
    for (const k of Object.keys(m)) {
  
    }
    if (m.team) {
     
      for (const k of Object.keys(m.team)) {
    
      }
    }
    if (m.season) {

    }
  }

  if (me.playerRelationships?.[0]) {
    const pr = me.playerRelationships[0];
    console.log('\n=== Bytes de playerRelationships[0] ===');
    for (const k of Object.keys(pr)) {
      console.log(`pr.${k}:`, bytesOf(pr[k]));
    }
    if (pr.tutorUser) {
      console.log('\n=== Bytes de playerRelationships[0].tutorUser ===');
      for (const k of Object.keys(pr.tutorUser)) {
        console.log(`tutorUser.${k}:`, bytesOf(pr.tutorUser[k]));
      }
    }
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});