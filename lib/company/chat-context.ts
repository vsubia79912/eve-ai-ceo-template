export function resolveEngineeringRepository(input: {
  readonly explicitRepository?: string | null;
  readonly chatRepository?: string | null;
  readonly projectRepository?: string | null;
}) {
  return clean(input.explicitRepository) ?? clean(input.chatRepository) ?? clean(input.projectRepository);
}

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}
