const req = require('../req')
const fs = require('fs')
const path = require('path')
const enUS = req.modules('dictionary-en-us')
const { PREINSTALLED_DICTIONARIES } = req.shared('constants.js')
const { USER_DICTIONARIES_PATH } = req.mprocManager('PathManager')

class DictionaryLoad {
  /* **************************************************************************/
  // Lifecycle
  /* **************************************************************************/

  constructor () {
    this._installedDictionaries = null
  }

  /* **************************************************************************/
  // Loader Utils
  /* **************************************************************************/

  /**
  * Loads a custom dictionary from disk
  * @param language: the language to load
  * @return promise
  */
  _loadCustomDictionary_ (language) {
    return new Promise((resolve, reject) => {
      const tasks = [
        { path: path.join(USER_DICTIONARIES_PATH, language + '.aff'), type: 'aff' },
        { path: path.join(USER_DICTIONARIES_PATH, language + '.dic'), type: 'dic' }
      ].map((desc) => {
        return new Promise((resolve, reject) => {
          fs.readFile(desc.path, (err, data) => {
            err ? reject(Object.assign({ error: err }, desc)) : resolve(Object.assign({ data: data }, desc))
          })
        })
      })

      Promise.all(tasks)
        .then((loaded) => {
          const loadObj = loaded.reduce((acc, load) => {
            acc[load.type] = load.data
            return acc
          }, {})
          resolve(loadObj)
        }, (err) => {
          reject(err)
        })
    })
  }

  /**
  * Loads an inbuilt language
  * @param language: the language to load
  * @return promise
  */
  _loadInbuiltDictionary_ (language) {
    if (language === 'en_US') {
      return new Promise((resolve, reject) => {
        enUS((err, load) => {
          if (err) {
            reject(err)
          } else {
            resolve({ aff: load.aff, dic: load.dic })
          }
        })
      })
    } else {
      return Promise.reject(new Error('Unknown Dictionary'))
    }
  }

  /* **************************************************************************/
  // Loaders
  /* **************************************************************************/

  /**
  * Loads a dictionary
  * @param language: the language to load
  * @return promise
  */
  load (language) {
    return new Promise((resolve, reject) => {
      this._loadInbuiltDictionary_(language).then(
        (dic) => resolve(dic),
        (_err) => {
          this._loadCustomDictionary_(language).then(
            (dic) => resolve(dic),
            (_err) => reject(new Error('Unknown Dictionary'))
          )
        }
      )
    })
  }

  /* **************************************************************************/
  // Installed
  /* **************************************************************************/

  /**
  * Gets the installed dictionaries
  * @return a list of dictionary codes
  */
  getInstalledDictionaries () {
    if (!this._installedDictionaries) {
      let files
      try {
        files = fs.readdirSync(USER_DICTIONARIES_PATH)
      } catch (ex) {
        files = []
      }

      const dictionaries = files.reduce((acc, filename) => {
        const ext = path.extname(filename).replace('.', '')
        const lang = path.basename(filename, '.' + ext)
        acc[lang] = acc[lang] || {}
        acc[lang][ext] = true
        return acc
      }, {})
      this._installedDictionaries = Object.keys(dictionaries)
        .filter((lang) => dictionaries[lang].aff && dictionaries[lang].dic)
        .concat(PREINSTALLED_DICTIONARIES)
    }

    return this._installedDictionaries
  }
}

module.exports = new DictionaryLoad()
