import { randomInt, randomUUID } from 'node:crypto'

export type Workflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>

export const avatarPrompt = [
  'Transform the person in the reference photo into a recognizable Minecraft-style 3D blocky game character.',
  'Preserve the person\'s recognizable facial features, skin tone, hair length, hairstyle, bangs, hair color, and original clothing from the reference.',
  'Keep the original hair length and outfit. Do not add new accessories.',
  'Compose a square chest-up portrait with the entire head, neck, shoulders and top of the original clothing visible. Center the face, looking toward the camera.',
  'Use Minecraft-style cubic shapes and pixel textures for both the person and the environment.',
  'Place the person in a colorful voxel game world with grassy blocks, small trees, distant mountains, and a bright blue sky with cubic clouds. The environment fills the entire background.',
  'Soft daylight and a polished game-art style. No text, no logo, no watermark.',
].join(' ')

export function buildWorkflow(template: Workflow, inputName: string): Workflow {
  const graph = structuredClone(template)
  const expected = { '76': 'LoadImage', '75:74': 'CLIPTextEncode', '75:73': 'RandomNoise', '75:66': 'EmptyFlux2LatentImage', '75:62': 'Flux2Scheduler', '9': 'SaveImage' }
  for (const [id, type] of Object.entries(expected)) {
    if (graph[id]?.class_type !== type) throw new Error(`Workflow is missing ${type} (${id}).`)
  }
  graph['76'].inputs.image = inputName
  graph['75:74'].inputs.text = avatarPrompt
  graph['75:73'].inputs.noise_seed = randomInt(0, 2 ** 48 - 1)
  for (const id of ['75:66', '75:62']) {
    graph[id].inputs.width = 1024
    graph[id].inputs.height = 1024
  }
  graph['9'].inputs.filename_prefix = `Blocky/${randomUUID()}`
  return graph
}
