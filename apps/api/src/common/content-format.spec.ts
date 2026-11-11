import { parseModelJson, repairLatexEscapes } from './content-format';

describe('repairLatexEscapes', () => {
  const parse = (raw: string) => parseModelJson<{ q: string }>(raw).q;

  it('keeps LaTeX commands that collide with JSON escapes', () => {
    expect(parse('{"q":"$2\\times 3$"}')).toBe('$2\\times 3$');
    expect(parse('{"q":"$u=2x\\rightarrow v$"}')).toBe('$u=2x\\rightarrow v$');
    expect(parse('{"q":"$\\frac{a}{b}$ و $\\beta$"}')).toBe(
      '$\\frac{a}{b}$ و $\\beta$',
    );
    expect(parse('{"q":"$a \\neq b$, $\\nabla f$"}')).toBe(
      '$a \\neq b$, $\\nabla f$',
    );
    expect(parse('{"q":"$\\underline{x}$"}')).toBe('$\\underline{x}$');
  });

  it('leaves correctly escaped LaTeX and real escapes alone', () => {
    expect(parse('{"q":"$2\\\\times 3$"}')).toBe('$2\\times 3$');
    expect(parse('{"q":"سطر\\nسطر\\tبعد"}')).toBe('سطر\nسطر\tبعد');
    expect(parse('{"q":"line\\nThe end"}')).toBe('line\nThe end');
    expect(parse('{"q":"\\u0627\\"x\\""}')).toBe('ا"x"');
  });

  it('does not touch an even run of backslashes', () => {
    expect(repairLatexEscapes('"a\\\\\\\\times"')).toBe('"a\\\\\\\\times"');
  });

  it('strips markdown code fences (```json and ```)', () => {
    const raw = '```json\n{"q":"مرحباً بك"}\n```';
    expect(parse(raw)).toBe('مرحباً بك');
  });

  it('strips preambles and postambles around JSON', () => {
    const raw = 'Here is the output:\n```json\n{"q":"سؤال تجريبي"}\n```\nHope it helps!';
    expect(parse(raw)).toBe('سؤال تجريبي');
  });

  it('repairs truncated JSON output gracefully', () => {
    const raw = '{"questions": [{"q": "سؤال مكتمل"';
    const parsed = parseModelJson<{ questions: { q: string }[] }>(raw);
    expect(parsed.questions[0].q).toBe('سؤال مكتمل');
  });
});
