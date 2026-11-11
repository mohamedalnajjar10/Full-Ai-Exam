import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

const branchesData: { name: string; subjects: string[] }[] = [
  {
    name: 'علمي',
    subjects: [
      'رياضيات',
      'فيزياء',
      'كيمياء',
      'أحياء',
      'اللغة العربية',
      'اللغة الإنجليزية',
      'التربية الإسلامية',
    ],
  },
  {
    name: 'أدبي',
    subjects: [
      'التاريخ',
      'الجغرافيا',
      'اللغة العربية',
      'اللغة الإنجليزية',
      'الرياضيات الأدبية',
      'التربية الإسلامية',
    ],
  },
  {
    name: 'صناعي',
    subjects: [
      'الرياضيات الصناعية',
      'الفيزياء',
      'الرسم الهندسي',
      'علم الصناعة',
      'اللغة العربية',
      'اللغة الإنجليزية',
    ],
  },
  {
    name: 'شرعي',
    subjects: [
      'الفقه الإسلامي',
      'أصول الفقه',
      'الحديث الشريف وعلومه',
      'اللغة العربية',
      'اللغة الإنجليزية',
      'التربية الإسلامية',
    ],
  },
];

async function main() {
  console.log('Seeding database...');

  for (const branchData of branchesData) {
    const branch = await prisma.branch.upsert({
      where: { name: branchData.name },
      update: {},
      create: {
        name: branchData.name,
      },
    });

    for (const subjectName of branchData.subjects) {
      await prisma.subject.upsert({
        where: {
          name_branchId: {
            name: subjectName,
            branchId: branch.id,
          },
        },
        update: {},
        create: {
          name: subjectName,
          branchId: branch.id,
        },
      });
    }

    console.log(`Synced branch: ${branch.name} with ${branchData.subjects.length} subjects`);
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const adminDefaultPassword =
    process.env.SEED_ADMIN_PASSWORD || 'AdminPassword123!';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
    select: { id: true, passwordHash: true },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminDefaultPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'Admin',
        role: Role.ADMIN,
        staffRoleId: 'super_admin',
        emailVerified: true,
      },
    });
    console.log(`Admin user created: ${adminEmail} / ${adminDefaultPassword}`);
  } else {
    // Prevent security vulnerability: Never overwrite existing admin's password on subsequent seeds!
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        role: Role.ADMIN,
        staffRoleId: 'super_admin',
        emailVerified: true,
        // Only set default password if account previously had no password hash at all
        ...(existingAdmin.passwordHash
          ? {}
          : { passwordHash: await bcrypt.hash(adminDefaultPassword, 12) }),
      },
    });
    console.log(`Admin user preserved (password intact): ${adminEmail}`);
  }

  const teachersData = [
    {
      name: 'أ. أمل محمود',
      title: 'معلمة رياضيات',
      subjectName: 'رياضيات',
      bio: 'خبرة أكثر من 12 عاماً في تدريس المناهج وتجهيز الطلاب للامتحانات الوزارية.',
      yearsOfExperience: 12,
      displayOrder: 1,
    },
    {
      name: 'أ. أحمد إبراهيم',
      title: 'معلم فيزياء',
      subjectName: 'فيزياء',
      bio: 'متخصص في تبسيط قوانين الحركة والكهربائية وتطبيقها عبر أمثلة عملية وسلسة.',
      yearsOfExperience: 10,
      displayOrder: 2,
    },
    {
      name: 'أ. سارة يوسف',
      title: 'معلمة كيمياء',
      subjectName: 'كيمياء',
      bio: 'خبرة تتجاوز 8 أعوام في تبسيط المفاهيم العلمية والمعادلات وتدريب الطلاب على التجارب.',
      yearsOfExperience: 8,
      displayOrder: 3,
    },
    {
      name: 'أ. رانيا النجار',
      title: 'معلمة احياء',
      subjectName: 'أحياء',
      bio: 'متخصصة في شرح السلاسل الحيوية ورسومات المنهج بطرق توضيحية تفاعلية ومبسطة.',
      yearsOfExperience: 8,
      displayOrder: 4,
    },
    {
      name: 'أ. خالد الشريف',
      title: 'معلم لغة عربية',
      subjectName: 'اللغة العربية',
      bio: 'خبرة 15 عاماً في تدريس قواعد النحو والديوان والأدب وتأهيل الطلاب للتعبير الإبداعي.',
      yearsOfExperience: 15,
      displayOrder: 5,
    },
    {
      name: 'أ. محمود حسن',
      title: 'معلم لغة إنجليزية',
      subjectName: 'اللغة الإنجليزية',
      bio: 'خبرة أكثر من 10 أعوام في تطوير مهارات المحادثة والتأسيس للامتحانات المعيارية.',
      yearsOfExperience: 10,
      displayOrder: 6,
    },
    {
      name: 'أ. محمد العلي',
      title: 'معلم تربية اسلامية',
      subjectName: 'التربية الإسلامية',
      bio: 'خبرة 14 عاماً في شرح أحكام التلاوة والتجويد وتبسيط الفقه والسيرة النبوية الشريفة.',
      yearsOfExperience: 14,
      displayOrder: 7,
    },
    {
      name: 'أ. عبد الرحمن القاسم',
      title: 'معلم تكنولوجيا',
      subjectName: 'تكنولوجيا',
      bio: 'خبرة 10 سنوات في تدريس أساسيات البرمجة، قواعد البيانات، والأنظمة الرقمية للتوجيهي.',
      yearsOfExperience: 10,
      displayOrder: 8,
    },
  ];

  console.log('Seeding elite teachers ("نخبة المعلمين")...');
  for (const t of teachersData) {
    // Find subject if exists
    const subject = await prisma.subject.findFirst({
      where: { name: { contains: t.subjectName } },
    });

    const existingTeacher = await prisma.teacher.findFirst({
      where: { name: t.name },
    });

    if (existingTeacher) {
      await prisma.teacher.update({
        where: { id: existingTeacher.id },
        data: {
          title: t.title,
          bio: t.bio,
          subjectId: subject?.id ?? null,
          yearsOfExperience: t.yearsOfExperience,
          displayOrder: t.displayOrder,
          isActive: true,
        },
      });
    } else {
      await prisma.teacher.create({
        data: {
          name: t.name,
          title: t.title,
          bio: t.bio,
          subjectId: subject?.id ?? null,
          yearsOfExperience: t.yearsOfExperience,
          displayOrder: t.displayOrder,
          isActive: true,
        },
      });
    }
  }
  console.log(`Synced ${teachersData.length} elite teachers.`);

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
