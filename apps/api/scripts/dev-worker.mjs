// يشغّل عملية الـ worker بالتطوير ويعيد تشغيلها كل ما يتغير dist.
//
// ما منستعمل `node --watch`: الـ API بيبني بـ nest --watch مع deleteOutDir،
// يعني كل بناء بيمسح dist ويرجع ينشئه. node --watch بيراقب الملفات نفسها،
// فلما تنمسح بيضيع الأثر — والـ worker يلي وقع وقت البناء بيضل واقف للأبد
// والملفات بتضل «قيد المعالجة» بدون ما حدا يسحبها من الطابور.
import { spawn } from 'node:child_process';
import { existsSync, watch } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const entry = 'dist/worker.js';
let child = null;
let stopping = false;
let timer = null;

async function start() {
  // البناء ممكن يكون بنصّه — نستنى لحد ما يطلع ملف الدخول
  while (!existsSync(entry)) await sleep(500);
  const proc = spawn(process.execPath, ['--enable-source-maps', entry], {
    stdio: 'inherit',
  });
  child = proc;
  proc.on('exit', (code, signal) => {
    // عملية قديمة طلعت بعد ما اشتغلت الجديدة — ما منمسح مرجع الجديدة
    if (child === proc) child = null;
    if (!stopping && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
      console.log(`[dev-worker] worker exited (${signal ?? code}); waiting for the next build`);
    }
  });
}

async function stop() {
  const old = child;
  if (!old) return;
  child = null;
  await new Promise((resolve) => {
    old.once('exit', resolve);
    old.kill('SIGTERM');
    // الإغلاق بيستنى المهمة الحالية (OCR ممكن ياخد دقايق)؛ BullMQ
    // بيرجّع المهمة المقطوعة للطابور وبتكمّل من نقطة الحفظ
    setTimeout(() => old.kill('SIGKILL'), 5000).unref();
  });
}

// إعادة تشغيل وحدة بالمرة: تغيير وصل وإحنا بنعيد التشغيل بيعلّم «كمان مرة»
// بدل ما يبدأ دورة تانية بالتوازي (وإلا بيطلع عمليتين worker سوا)
let cycling = false;
let again = false;
async function cycle() {
  if (cycling) {
    again = true;
    return;
  }
  cycling = true;
  do {
    again = false;
    await stop();
    if (!stopping) await start();
  } while (again && !stopping);
  cycling = false;
}

function restart() {
  clearTimeout(timer);
  // البناء بيكتب عشرات الملفات ورا بعض — منستنى لحد ما يهدا
  timer = setTimeout(cycle, 1500);
}

// مراقبة dist بتموت لما ينمسح، فمنراقب المجلد الأب كمان ومنرجع نسلّحها
let distWatcher = null;
function watchDist() {
  if (distWatcher || !existsSync('dist')) return;
  try {
    distWatcher = watch('dist', { recursive: true }, restart);
    distWatcher.on('error', () => {
      distWatcher?.close();
      distWatcher = null;
    });
  } catch {
    distWatcher = null;
  }
}
watch('.', (_event, file) => {
  if (file !== 'dist') return;
  distWatcher?.close();
  distWatcher = null;
  watchDist();
  restart();
});
setInterval(watchDist, 2000).unref();
watchDist();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    if (child) child.kill(signal);
    process.exit(0);
  });
}

await cycle();
