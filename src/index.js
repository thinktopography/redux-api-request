import _ from 'lodash'
import qs from 'qs'
import rest from 'rest'
import params from 'rest/interceptor/params'
import mime from 'rest/interceptor/mime'
import defaultRequest from 'rest/interceptor/defaultRequest'
import errorCode from 'rest/interceptor/errorCode'
import * as actionTypes from './action_types'

const defaultClient = rest.wrap(params).wrap(mime).wrap(defaultRequest).wrap(errorCode)

export default (options = {}) => {

  const client = options.client || defaultClient

  const defaultHost = options.defaultHost || ''

  return store => next => action => {

    const [, namespace, type] = action.type.match(/([\a-z0-9_\.]*)?\/?([A-Z0-9_]*)/)

    if(type !== actionTypes.API_REQUEST) return next(action)

    const request_id = _.random(100000, 999999).toString(36)

    const headers = {
      'Content-Type': 'application/json',
      ...action.headers ? action.headers : {},
      ...action.token ? { 'Authorization': `Bearer ${action.token}` } : {}
    }

    const method = action.method ? action.method.toUpperCase() : 'GET'

    const endpoint = action.endpoint.substr(0,4) !== 'http' ? `${defaultHost}${action.endpoint}` : action.endpoint

    const path = (action.query && method === 'GET') ? `${endpoint}?${qs.stringify(action.query)}` : endpoint

    const entity = (action.body && method !== 'GET') ? action.body : {}

    const params = action.body || action.query

    const request = _.omitBy({ headers, method, path, params }, _.isNil)

    const cid = (action.cid) ? { cid: action.cid } : {}

    coerceArray(action.request).map(requestAction => {
      store.dispatch({
        type: withNamespace(namespace, requestAction),
        ...action.meta,
        ...cid,
        request_id,
        request
      })
    })


    const success = (response) => {

      const result = response.entity

      coerceArray(action.success).map(successAction => {
        store.dispatch({
          type: withNamespace(namespace, successAction),
          ...action.meta,
          ...cid,
          request_id,
          result
        })
      })

      if(action.onSuccess) action.onSuccess(result)

    }

    const failure = (response) => {

      const result = response.entity

      if(response.status.code === 401) store.dispatch({ type: 'API_UNAUTHENTICATED' })

      if(response.status.code === 403) store.dispatch({ type: 'API_UNAUTHORIZED' })

      coerceArray(action.failure).map(failureAction => {
        store.dispatch({
          type: withNamespace(namespace, failureAction),
          ...action.meta,
          ...cid,
          request_id,
          result
        })
      })

      if(action.onFailure) action.onFailure(result)

    }

    return client({ headers, method, path, entity }).then(success, failure)

  }

}

const coerceArray = (value) => {
  return value ? (!_.isArray(value) ? [value] : value) : []
}

const withNamespace = (namespace, type) => {
  return namespace ? `${namespace}/${type}` : type
}
