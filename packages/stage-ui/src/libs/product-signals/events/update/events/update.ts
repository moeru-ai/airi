import { defineEvent } from '../../../utils/dsl'

export const updateCheckClickedEvent = defineEvent<{ channel: string }>('update_check_clicked')

export const updateInstallClickedEvent = defineEvent<{
  channel: string
  version?: string
}>('update_install_clicked')
