'use strict'

const accessPolicy = require('../profitability-entitlement-policy')
const accessProfile = require('./access-profile-v2')
const accessProfileRepository = require('./access-profile-repository')
const domain = require('./domain')
const projection = require('./projection-v2')
const repository = require('./repository')

module.exports = {
  ...accessPolicy,
  ...accessProfile,
  ...accessProfileRepository,
  ...domain,
  ...projection,
  ...repository,
}
