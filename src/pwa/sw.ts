/// <reference lib="WebWorker" />

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

declare let self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    revision: string | null
    url: string
  }>
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
self.skipWaiting()
clientsClaim()

registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'MT_GET_BUILD_ID') {
    return
  }

  event.ports[0]?.postMessage({
    type: 'MT_BUILD_ID',
    buildId: __APP_BUILD_ID__,
  })
})

export {}
