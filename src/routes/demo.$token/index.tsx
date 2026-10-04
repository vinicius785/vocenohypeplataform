import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/$token/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/demo/$token/inicio", params });
  },
});
