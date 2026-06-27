import { redirect } from "next/navigation";

export default async function LegacyCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/inbox/${id}`);
}
