import axios from 'axios'
import { useState } from 'react'

export default ({ url, method, body, onSuccess }) => {
  const [errors, setErrors] = useState(null)

  const doRequest = async (props = {}) => {
    try {
      setErrors(null)
      const response = await axios[method](url, 
        { 
          ...body, 
          ...props 
        }
      )
      onSuccess && onSuccess(response.data)
      return response.data
    } catch (err) {
      console.log(err)
      setErrors(
        <div className="alert alert-danger">
          <h4>Ooops...</h4>
          <ul className="my-0">
            {(err && err.message) || 'invalid request'}
          </ul>
        </div>
      )
    }
  }

  return { doRequest, errors }
}