import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Linking Teachers to Real Subject IDs ---');

  const teachers = await prisma.teacher.findMany();
  const subjects = await prisma.subject.findMany({ include: { branch: true } });

  console.log(`Found ${teachers.length} teachers and ${subjects.length} subjects.`);

  const normalize = (text: string) =>
    (text || '')
      .toLowerCase()
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[\u064B-\u065F]/g, '')
      .trim();

  const keywordMap: { patterns: string[]; subjectKeyword: string }[] = [
    { patterns: ['عرب', 'لغه عربيه', 'نحو', 'ادب', 'بلاغه'], subjectKeyword: 'عرب' },
    { patterns: ['انجل', 'انجليز', 'لغه انجليزيه', 'english'], subjectKeyword: 'انجل' },
    { patterns: ['رياض', 'حساب', 'جبر', 'تفاضل', 'هندسه', 'math'], subjectKeyword: 'رياض' },
    { patterns: ['فيزي', 'physics', 'ميكانيكا', 'ديناميكا'], subjectKeyword: 'فيزي' },
    { patterns: ['كيمي', 'chemistry'], subjectKeyword: 'كيمي' },
    { patterns: ['احي', 'احياء', 'بيولوجي', 'biology'], subjectKeyword: 'احي' },
    { patterns: ['اسلام', 'دين', 'فقه', 'شريع', 'قران', 'تلاوه', 'حديث'], subjectKeyword: 'اسلام' },
    { patterns: ['تاريخ', 'history'], subjectKeyword: 'تاريخ' },
    { patterns: ['جغراف', 'geography'], subjectKeyword: 'جغراف' },
    { patterns: ['تكنول', 'حاسوب', 'برمج'], subjectKeyword: 'تكنول' },
  ];

  for (const teacher of teachers) {
    const combined = `${normalize(teacher.title)} ${normalize(teacher.bio)}`;
    let matchedSubject: any = null;


    for (const entry of keywordMap) {
      if (entry.patterns.some((p) => combined.includes(p))) {
        matchedSubject = subjects.find((s) => normalize(s.name).includes(entry.subjectKeyword));
        if (matchedSubject) break;
      }
    }

    if (!matchedSubject) {
      for (const subject of subjects) {
        const normSub = normalize(subject.name);
        if (combined.includes(normSub) || normSub.includes(normalize(teacher.title))) {
          matchedSubject = subject;
          break;
        }
      }
    }

    if (!matchedSubject && subjects.length > 0) {
      matchedSubject = subjects[0];
    }

    if (matchedSubject) {
      await prisma.teacher.update({
        where: { id: teacher.id },
        data: { subjectId: matchedSubject.id },
      });
      console.log(`[LINKED] "${teacher.name}" (${teacher.title}) -> "${matchedSubject.name}" [ID: ${matchedSubject.id}]`);
    }
  }

  console.log('--- Done linking all teachers! ---');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });
