'use strict'

const TOKEN_FILE = './tokens.json'
const request = require('request-promise')
const express = require('express')
const fs = require('fs')

let settings = {
  baseUrl: process.env.BASE_URL,
  spotify: {
    clientID: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  }
}
settings.returnUrl = settings.baseUrl + '/auth/spotify/return'

let loadTokens = () => {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE).toString('utf8'))
  } catch (e) {
    return {
      spotify: {},
      google: {}
    }
  }
}

let saveTokens = (currentSettings) => {
  let data = JSON.stringify(currentSettings)
  return fs.writeFileSync(TOKEN_FILE, data)
}

let wait = (time) => {
  return new Promise((req, res) => {
    setTimeout(() => res, time)
  })
}

let formatAlbum = (item) => {
  let data = {}
  data.artist = item.album.artists[0].name
  data.album = item.album.name
  data.releaseDate = item.album.release_date
  return data
}

let spotifyRequest = (url) => {
  console.log(`Loading ${url}`)
  return request({
    url,
    json: true,
    headers: {
      Authorization: 'Bearer ' + tokens.spotify.accessToken
    }
  }).then(data => data, err => {
    console.log('error', err.StatusCode, err)
    throw err
  })
}

let loadAll = (url, offset, limit) => {
  let records = []
  let step = (data) => {
    if (data.items.length) {
      records = records.concat(data.items.map(formatAlbum))
      offset += limit
    }
    if (data.next) {
      return spotifyRequest(data.next).then(step)
    } else {
      return records
    }
  }

  return spotifyRequest(url, {offset, limit}).then(step)
}

let tokens = loadTokens()
let app = express()
app.use(express.static('public'))
app.get('/', function (req, res) {
  if (tokens.spotify.accessToken) {
    res.redirect('/dashboard')
  } else {
    res.redirect('/auth/spotify')
  }
})
app.get('/auth/spotify', function (req, res) {
  let redirect = encodeURI(settings.returnUrl)
  res.redirect(`https://accounts.spotify.com/authorize?response_type=code&client_id=${settings.spotify.clientID}&redirect_uri=${redirect}&scope=user-library-read`)
})

app.get('/auth/spotify/return', function (req, res) {
  request.post({
    url: 'https://accounts.spotify.com/api/token',
    json: true,
    form: {
      client_id: settings.spotify.clientID,
      client_secret: settings.spotify.clientSecret,
      grant_type: 'authorization_code',
      code: req.query.code,
      redirect_uri: settings.returnUrl
    }
  }).then(data => {
    tokens.spotify.accessToken = data.access_token
    tokens.spotify.refreshToken = data.refresh_token
    saveTokens(tokens)
    res.redirect('/dashboard')
  }).catch(err => res.json({error: err.message}))
})

app.get('/dashboard', function (req, res) {
  loadAll('https://api.spotify.com/v1/me/albums')
    .then(data => res.json(data))
    .catch(err => res.status(500).json({error: err}))
})
app.listen(3000)
