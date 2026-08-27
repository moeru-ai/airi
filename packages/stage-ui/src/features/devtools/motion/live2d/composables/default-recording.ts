import idleExcitedProjectJson from '../assets/idle-excited.json?raw'

import { parseLive2DMotionProject } from './keyframes'

/** The validated trajectory that initializes the Live2D motion devtool. */
export const defaultLive2DMotionRecording = parseLive2DMotionProject(idleExcitedProjectJson).source
