import { redirect } from "next/navigation";

export default async function ExamsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") {
        qs.set(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => qs.append(key, v));
      }
    }
  }
  const query = qs.toString();
  redirect(query ? `/exams/archive?${query}` : "/exams/archive");
}
