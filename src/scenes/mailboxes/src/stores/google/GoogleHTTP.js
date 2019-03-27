import Bootstrap from 'R/Bootstrap'
import querystring from 'querystring'
import { google } from 'googleapis'
import FetchService from 'shared/FetchService'

const gmail = google.gmail('v1')
const oauth2 = google.oauth2('v2')
const OAuth2 = google.auth.OAuth2
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = Bootstrap.credentials

// @Thomas101#8
class GoogleHTTP {
  /* **************************************************************************/
  // Utils
  /* **************************************************************************/

  /**
  * Rejects a call because the mailbox has no authentication info
  * @param info: any information we have
  * @return promise - rejected
  */
  static _rejectWithNoAuth (info) {
    return Promise.reject(new Error('Mailbox missing authentication information'))
  }

  /* **************************************************************************/
  // Auth
  /* **************************************************************************/

  /**
  * Generates the auth token object to use with Google
  * @param accessToken: the access token from the mailbox
  * @param refreshToken: the refresh token from the mailbox
  * @param expiryTime: the expiry time from the mailbox
  * @return the google auth object
  */
  static generateAuth (accessToken, refreshToken, expiryTime) {
    const auth = new OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
    auth.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: expiryTime
    })
    return auth
  }

  /**
  * Upgrades the initial temporary access code to a permenant access code
  * @param authCode: the temporary auth code
  * @param codeRedirectUri: the redirectUri that was used in getting the current code
  * @return promise
  */
  static upgradeAuthCodeToPermenant (authCode, codeRedirectUri) {
    return Promise.resolve()
      .then(() => window.fetch('https://accounts.google.com/o/oauth2/token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: querystring.stringify({
          code: authCode,
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          grant_type: 'authorization_code',
          redirect_uri: codeRedirectUri
        })
      }))
      .then((res) => res.ok ? Promise.resolve(res) : Promise.reject(res))
      .then((res) => res.json())
      .then((res) => Object.assign({ date: new Date().getTime() }, res))
  }

  /* **************************************************************************/
  // Watch
  /* **************************************************************************/

  /**
  * Watches an account for changes
  * @param auth: the auth to access google with
  * @return promise
  */
  static watchAccount (auth) {
    if (!auth) { return this._rejectWithNoAuth() }

    return Promise.resolve()
      .then(() => {
        return Promise.resolve()
          .then(() => gmail.users.watch({
            userId: 'me',
            resource: {
              topicName: 'projects/wavebox-158310/topics/gmail'
            },
            auth: auth
          }))
          .catch((ex) => {
            if (ex && typeof (ex.message) === 'string' && ex.message.startsWith('Only one user push notification client allowed per developer')) {
              // This suggests we're connected elsewhere - nothing to really do here, just look success-y
              console.info('The failing status 400 call to https://www.googleapis.com/gmail/v1/users/me/watch is handled gracefully')
              return Promise.resolve({ status: 200, data: {} })
            } else {
              return Promise.reject(ex)
            }
          })
      })
      .then((res) => {
        if (res.status === 200) {
          return Promise.resolve(res.data)
        } else {
          return Promise.reject(new Error(`Invalid HTTP status code ${res.status}`))
        }
      })
  }

  /* **************************************************************************/
  // Profile
  /* **************************************************************************/

  /**
  * Syncs a profile for a mailbox
  * @param auth: the auth to access google with
  * @return promise
  */
  static fetchAccountProfile (auth) {
    if (!auth) { return this._rejectWithNoAuth() }

    return Promise.resolve()
      .then(() => oauth2.userinfo.get({ userId: 'me', auth: auth }))
      .then((res) => {
        if (res.status === 200) {
          return Promise.resolve(res.data)
        } else {
          return Promise.reject(new Error(`Invalid HTTP status code ${res.status}`))
        }
      })
  }

  /**
  * Fetches a profile for a mailbox but with the raw auth details from google
  * @param rawAuth: the raw auth credentials from google
  * @return promise
  */
  static fetchAccountProfileWithRawAuth (rawAuth) {
    const expiry = new Date().getTime() + rawAuth.expires_in
    const auth = GoogleHTTP.generateAuth(rawAuth.access_token, rawAuth.refresh_token, expiry)
    return GoogleHTTP.fetchAccountProfile(auth)
  }

  /* **************************************************************************/
  // Gmail
  /* **************************************************************************/

  /**
  * Gets the users profile
  * @param auth: the auth object to access API
  * @return promise
  */
  static fetchGmailProfile (auth) {
    if (!auth) { return this._rejectWithNoAuth() }

    return Promise.resolve()
      .then(() => gmail.users.getProfile({
        userId: 'me',
        auth: auth
      }))
      .then((res) => {
        if (res.status === 200) {
          return Promise.resolve(res.data)
        } else {
          return Promise.reject(new Error(`Invalid HTTP status code ${res.status}`))
        }
      })
  }

  /**
  * Fetches the history list of changes
  * @param auth: the auth objecto to access API
  * @param fromHistoryId: the start history id to get changes from
  * @return promise
  */
  static fetchGmailHistoryList (auth, fromHistoryId) {
    if (!auth) { return this._rejectWithNoAuth() }

    return Promise.resolve()
      .then(() => gmail.users.history.list({
        userId: 'me',
        startHistoryId: fromHistoryId,
        auth: auth
      }))
      .then((res) => {
        if (res.status === 200) {
          return Promise.resolve(res.data)
        } else {
          return Promise.reject(new Error(`Invalid HTTP status code ${res.status}`))
        }
      })
  }

  /* **************************************************************************/
  // Gmail: Labels
  /* **************************************************************************/

  /**
  * Syncs the label for a mailbox. The label is a cheap call which can be used
  * to decide if the mailbox has changed
  * @param auth: the auth to access google with
  * @param labelId: the id of the label to sync
  * @return promise
  */
  static fetchGmailLabel (auth, labelId) {
    if (!auth) { return this._rejectWithNoAuth() }

    return Promise.resolve()
      .then(() => gmail.users.labels.get({
        userId: 'me',
        id: labelId,
        auth: auth
      }))
      .then((res) => {
        if (res.status === 200) {
          return Promise.resolve(res.data)
        } else {
          return Promise.reject(new Error(`Invalid HTTP status code ${res.status}`))
        }
      })
  }

  /* **************************************************************************/
  // Gmail: Threads
  /* **************************************************************************/

  /**
  * Fetches the unread summaries for a mailbox
  * @param auth: the auth to access google with
  * @param query = undefined: the query to ask the server for
  * @param labelIds = []: a list of label ids to match on
  * @param limit=10: the limit on results to fetch
  * @return promise
  */
  static fetchGmailThreadHeadersList (auth, query = undefined, labelIds = [], limit = 25) {
    if (!auth) { return this._rejectWithNoAuth() }

    return Promise.resolve()
      .then(() => gmail.users.threads.list({
        userId: 'me',
        labelIds: labelIds,
        q: query,
        maxResults: limit,
        auth: auth
      }))
      .then((res) => {
        if (res.status === 200) {
          return Promise.resolve(res.data)
        } else {
          return Promise.reject(new Error(`Invalid HTTP status code ${res.status}`))
        }
      })
  }

  /**
  * Fetches an email from a given id
  * @param auth: the auth to access google with
  * @param threadId: the id of the thread
  * @return promise
  */
  static fetchGmailThread (auth, threadId) {
    if (!auth) { return this._rejectWithNoAuth() }

    return Promise.resolve()
      .then(() => gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        auth: auth
      }))
      .then((res) => {
        if (res.status === 200) {
          return Promise.resolve(res.data)
        } else {
          return Promise.reject(new Error(`Invalid HTTP status code ${res.status}`))
        }
      })
  }

  /**
  * Fetches multiple emails email from a set of thread ids
  * @param auth: the auth to access google with
  * @param threadIds: the array of thread ids to fetch
  * @return promise
  */
  static fetchMultipleGmailThreads (auth, threadIds) {
    return Promise.all(threadIds.map((threadId) => {
      return this.fetchGmailThread(auth, threadId)
    }))
  }

  /**
  * Fetches the changed threads from the gmail server
  * @param auth: the auth to use with google
  * @param knownThreads: any currently known threads that don't need to be fetched in an object keyed by id
  * @param threadHeaders: the latest thread headers which will be used to fetch the full heads if required
  * @param postProcessThread=undefined: a function to post process a thread before returning it. This must leave historyId and id intact
  * @return promise: with the threads ordered by threadHeaders all full resolved
  */
  static fullyResolveGmailThreadHeaders (auth, knownThreads, threadHeaders, postProcessThread = undefined) {
    const changedThreadIds = threadHeaders
      .filter((threadHeader) => {
        const known = knownThreads[threadHeader.id]
        return !known || known.historyId !== threadHeader.historyId
      })
      .map((threadHeader) => threadHeader.id)

    return Promise.resolve()
      .then(() => GoogleHTTP.fetchMultipleGmailThreads(auth, changedThreadIds))
      .then((threads) => {
        return threads.reduce((acc, thread) => {
          acc[thread.id] = postProcessThread ? postProcessThread(thread) : thread
          return acc
        }, {})
      })
      .then((updatedThreads) => {
        return threadHeaders
          .map((threadHeader) => updatedThreads[threadHeader.id] || knownThreads[threadHeader.id])
          .filter((v) => !!v)
      })
  }

  /* **************************************************************************/
  // Gmail: Atom
  /* **************************************************************************/

  /**
  * Fetches the unread count from the atom feed
  * @param partitionId: the id of the partition to run with
  * @param url: the url to fetch
  * @return promise: the unread count or rejection if parsing failed
  */
  static fetchGmailAtomUnreadCount (partitionId, url) {
    return Promise.resolve()
      .then(() => FetchService.request(url, partitionId, { credentials: 'include' }))
      .then((res) => res.ok ? Promise.resolve(res) : Promise.reject(res))
      .then((res) => res.text())
      .then((res) => {
        const parser = new window.DOMParser()
        const xmlDoc = parser.parseFromString(res, 'text/xml')
        return Promise.resolve(xmlDoc)
      })
      .then((res) => {
        const el = res.getElementsByTagName('fullcount')[0]
        if (!el) { return Promise.reject(new Error('<fullcount> element not found')) }

        const count = parseInt(el.textContent)
        if (isNaN(count)) { return Promise.reject(new Error('Count is not a valid number')) }

        return Promise.resolve(count)
      })
  }

  static getCountFromAtom (xml) {
    const element = xml.querySelector('fullcount')
    if (!element) { return 0 }
    const count = parseInt(element.textContent)
    if (isNaN(count)) { return 0 }

    return count
  }

  static getModifiedFromAtom (xml) {
    const element = xml.querySelector('modified')
    if (!element) { return 0 }
    const timestamp = new Date(element.textContent).getTime()
    if (isNaN(timestamp)) { return 0 }
    return timestamp
  }

  static convertAtomMessageEntryToJSON (element) {
    let messageId
    const linkElement = element.querySelector('link')
    if (linkElement) {
      const href = linkElement.getAttribute('href')
      try {
        const purl = new URL(href)
        messageId = purl.searchParams.get('message_id')
      } catch (ex) { }
    }

    return {
      version: 2,
      title: (element.querySelector('title') || {}).textContent,
      summary: (element.querySelector('summary') || {}).textContent,
      issued: new Date((element.querySelector('issued') || {}).textContent).getTime(),
      modified: new Date((element.querySelector('modified') || {}).textContent).getTime(),
      fromName: (element.querySelector('author>name') || {}).textContent,
      fromEmail: (element.querySelector('author>email') || {}).textContent,
      id: messageId
    }
  }

  static getMessagesFromAtom (xml) {
    return Array.from(xml.querySelectorAll('entry')).map((element) => {
      return this.convertAtomMessageEntryToJSON(element)
    })
  }

  static fetchGmailAtomMessages (partitionId, url) {
    return Promise.resolve()
      .then(() => FetchService.request(url, partitionId, {
        credentials: 'include',
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': window.navigator.languages.length > 1
            ? `${window.navigator.language};q=0.9,${window.navigator.languages[window.navigator.languages.length - 1]};q=0.8`
            : window.navigator.language,
          'upgrade-insecure-requests': '1',
          'user-agent': window.navigator.userAgent
        }
      }))
      .then((res) => res.ok ? Promise.resolve(res) : Promise.reject(res))
      .then((res) => res.text())
      .then((res) => {
        const parser = new window.DOMParser()
        const xmlDoc = parser.parseFromString(res, 'text/xml')
        return Promise.resolve(xmlDoc)
      })
      .then((res) => {
        const count = this.getCountFromAtom(res)
        const timestamp = this.getModifiedFromAtom(res)
        const messages = this.getMessagesFromAtom(res)

        return Promise.resolve({
          count: count,
          timestamp: timestamp,
          messages: messages
        })
      })
  }

  static fetchGmailBasicHTML (partitionId) {
    return Promise.resolve()
      .then(() => FetchService.request('https://mail.google.com/mail/u/0/h/1pq68r75kzvdr/?v%3Dlui', partitionId, {
        credentials: 'include',
        headers: {
          'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3',
          'accept-encoding': 'gzip, deflate, br',
          'accept-language': window.navigator.languages.length > 1
            ? `${window.navigator.language};q=0.9,${window.navigator.languages[window.navigator.languages.length - 1]};q=0.8`
            : window.navigator.language,
          'upgrade-insecure-requests': '1',
          'user-agent': window.navigator.userAgent
        }
      }))
      .then((res) => res.ok ? Promise.resolve(res) : Promise.reject(res))
      .then((res) => res.text())
  }
}

export default GoogleHTTP
