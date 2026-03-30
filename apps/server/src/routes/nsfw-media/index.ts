import type { NsfwMediaService } from '../../services/nsfw-media'
import type { MqService } from '../../libs/mq'
import type { NsfwImageEvent } from '../../services/nsfw-image-events'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { safeParse } from 'valibot'

import { authGuard } from '../../middlewares/auth'
import { nanoid } from '../../utils/id'
import { createBadRequestError } from '../../utils/error'
import { createNsfwImageRequestedEvent } from '../../services/nsfw-image-events'
import { CreateGalleryItemSchema, CreateImageJobSchema } from './schema'

export function createNsfwMediaRoutes(mediaService: NsfwMediaService, nsfwImageMq?: MqService<NsfwImageEvent>) {
  return new Hono<HonoEnv>()
    .use('*', authGuard)
    .get('/jobs', async (c) => {
      const user = c.get('user')!
      const jobs = await mediaService.listImageJobs(user.id, 'nsfw')
      return c.json({ jobs })
    })
    .post('/jobs', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(CreateImageJobSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const job = await mediaService.createImageJob({
        ...result.output,
        userId: user.id,
        params: result.output.params ?? {},
      })

      if (nsfwImageMq) {
        await nsfwImageMq.publish(createNsfwImageRequestedEvent({
          eventId: nanoid(),
          userId: user.id,
          characterId: job.characterId,
          jobId: job.id,
          route: job.route,
          metadata: {
            sceneType: job.sceneType,
            tags: job.tags,
          },
        }))
      }

      return c.json(job, 201)
    })
    .get('/gallery', async (c) => {
      const user = c.get('user')!
      const items = await mediaService.listGalleryItems(user.id)
      return c.json({ items })
    })
    .post('/gallery', async (c) => {
      const user = c.get('user')!
      const body = await c.req.json()
      const result = safeParse(CreateGalleryItemSchema, body)
      if (!result.success)
        throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)

      const item = await mediaService.createGalleryItem({
        ...result.output,
        userId: user.id,
      })
      return c.json(item, 201)
    })
}
