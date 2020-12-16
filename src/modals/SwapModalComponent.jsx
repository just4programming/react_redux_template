import React from 'react'
import { change, Field } from 'redux-form'
import { NumericInput, rules, Dropdown } from '../components/reduxform'
import CommonModal from './CommonModal'
import SuccessModal from './SuccessModal'
import { util, format } from '../logic/utils'

function parse(decimals) {
  return (v) => {
    return v? format.decimals((v).toString(), decimals).toString() : undefined
  }
}

const DEBOUNCE_MSEC = 1000

export const fields = {
  from: 'from',
  to: 'to',
  currencyTo: 'currencyTo'
}

export default class SwapModalComponent extends React.Component {
  constructor(props) {
    super(props)
    this.state = { 
      success: false,
      from: {
        max: '100',
        fixedRateEnabled: false,
        decimals: 8,
        loading: false
      },
      to: {
        decimals: 8,
        loading: false
      },
      fixedRate: false,
      fixedRatePossible: false,
      currencies: {
        fixed: [],
        floating: []
      }
    }
    
    const { from, to } = this.state
    this.notmoreThanBalance = rules.maxBtc(
      props.balance.btc, 
      from.decimals, 
      { 
        included: true, 
        message: v => `
          Insufficient balance: enter value 
          less or equal to ${v} ${this.props.initCurrencyFrom}`
      }
    )
    this.debounced = util.debounce(this.onValueChangedIml, DEBOUNCE_MSEC)
  }

  setSuccess = () => setState({ success: true })

  async componentDidMount() {
    const { change, initCurrencyFrom, initCurrencyTo, doRequest } = this.props
    const currencyTo = initCurrencyTo

    const res = await doRequest({
      method: 'post',
      url: 'https://www.bitfi.com/exchange/currencies',
      body: {
        filter: 'ALL'
      }
    })
    const fixed = res.filter(v => v.fixedRateEnabled)
    const floating = res.filter(v => !v.fixedRateEnabled)
    
    this.setState({
      currencies: {
        fixed,
        floating
      }
    }, () => {
      const isCurrencyFromFixedRate = fixed.findIndex(v => v.currencySymbol.toUpperCase() === initCurrencyFrom.toUpperCase()) !== -1
      this.setState({ from: { ...this.state.from, fixedRateEnabled: isCurrencyFromFixedRate }}, 
        () => this.updateFixedRatePossible(initCurrencyTo)
      )
    })

    change(fields.currencyTo, currencyTo)
  }

  renderItem = (item, i, onSelected) => (
    <div
      onClick={onSelected}  
      className="w-100 d-flex d-flex justify-content-between pl-4 pr-4"
    >
      <a className="w-100  p-0">{item.value}</a> 
      <div>{item.fixedRate? 'fixed' : ''}</div>
    </div>
  )

  renderCurrencyOption = (name, readonly) => {
    const { initCurrencyFrom } = this.props
    const { currencies: { fixed, floating }, from } = this.state 
    
    const currencies = [...fixed, ...floating]
    const names = currencies.map(v => ({ 
      fixedRate: from.fixedRateEnabled && v.fixedRateEnabled,
      value: v.currencySymbol.toUpperCase() 
    })).filter(v => v.value.toUpperCase() !== initCurrencyFrom.toUpperCase())

    return (
      <Field 
        name={name} 
        readOnly={readonly}
        elements={names} 
        component={Dropdown}
        onChange={v => this.onCurrencyChanged(v)}
        validate={[ rules.required ]}
        renderItem={this.renderItem}
      >
      </Field>
    )
  }


  onRateTypeChanged = (v) => {
    const { amountFrom } = this.props
    this.setState({ fixedRate: v }, () => {
      this.onValueChanged(amountFrom, fields.to)
    })
  }

  onCurrencyChanged = async (to) => {
    this.updateFixedRatePossible(to)
    this.onValueChanged(this.props.amountFrom, fields.to)
  }

  updateFixedRatePossible = (to) => {
    const { from, currencies: { fixed } } = this.state
    const isCurrencyToFixedRate = fixed.findIndex(v => v.currencySymbol.toUpperCase() === to.toUpperCase()) !== -1
    const fixedRatePossible = from.fixedRateEnabled && isCurrencyToFixedRate
    
    this.setState({ fixedRatePossible, fixedRate: false })
  }

  onValueChanged = async (v, updateField) => {
    this.setLoading(true, updateField)
    return this.debounced(v, updateField)
  }

  onValueChangedIml = async (v, updateField) => {
    try {
      const { doRequest, change, currencyFrom, currencyTo, valid } = this.props
      const fromSymbol = updateField === fields.to? currencyFrom : currencyTo
      const toSymbol = updateField === fields.to? currencyTo : currencyFrom 

      const body = {
        fromSymbol,
        toSymbol,
        amountFrom: v,
        fixedRate: this.state.fixedRate
      }
      
      const res = await doRequest({
        url: 'https://www.bitfi.com/exchange/estimate',
        method: 'post',
        body
      })

      this.setState({ rate: res.rate })
      this.setLoading(false, updateField, () => {
        return res && res.amountTo && change(updateField, res.amountTo)
      })
    }
    catch (exc) {
      this.setState({ rate: null })
      this.setLoading(false, updateField)
      change(updateField, '')
    }
  }

  setLoading = (value, name, callback) => {
    this.setState({ [name]: { ...this.state[name], loading: value } }, () => {
      value && this.props.change(fields[name], '')
      callback && callback()
    })
  }

  onSubmit = async (data) => {
    const { doRequest, initCurrencyFrom } = this.props
    try {
      this.setState({ loading: true })
      const body = {
        authToken: 'kH6BbieWzvwDQriW+nS6++CVkKdqwXDEGe90nq7PiZeIEFk6d2oHRR5xQt50/m2ZwTyo3VlDZKPQBIyVPrwiFfqdUgrcnNOdi1xkJKY5sUu9JyY2VtMpAUCPYBW235FUA177SrSVSiD1DrW4YG9bl9Kou/Oes/sfHcmF9db6Fp5YxDuFwhLbdY+Ul7/TCdV2IcUqSBOL51PLC8e/3dmdpw==',
        toSymbol: data[fields.currencyTo].toLowerCase(),
        fromSymbol: initCurrencyFrom.toLowerCase(),
        amount: data[fields.from],
        fixedRate: this.state.fixedRate
      }

      const res = await doRequest({
        url: 'https://www.bitfi.com/exchange/accountswap',
        method: 'post',
        body
      })  

      if (res == null) {
        throw 'Something went wrong'
      }

      this.setState({ loading: false, success: true })
    }
    catch (exc) {
      this.setState({ loading: false })
    }
  }

  renderButtons = () => {
    const { handleSubmit, onClose, valid } = this.props
    const { from: { loading: loadingFrom }, to: { loading: loadingTo }, errors } = this.state
    const loading = loadingFrom || loadingTo

    return (
      <React.Component>
        <button 
          type="submit" 
          className="btn btn-primary" 
          disabled={loading || errors || !valid}
          onClick={handleSubmit(this.onSubmit)}
        >
          {loading? '...' : 'Swap request'}
        </button>

        <button 
          type="button" 
          className="btn btn-secondary" 
          onClick={onClose}
        >
          Close
        </button>
      </React.Component>
    )
  }
  
  renderError = ({input, meta, ...props}) => (
    meta.error &&
    <div className="alert alert-danger">
      <small>{meta.error}</small>
    </div>
  )

  render() {
    const { isOpen, onClose, errors, initCurrencyFrom, currencyTo } = this.props
    const { success, from, to, rate, fixedRate, fixedRatePossible } = this.state
    const loading = from.loading || to.loading
    
    if (success) {
      return (
        <SuccessModal
          isOpen={isOpen}
          onClose={onClose}
        />
      )
    }
    return (
      <CommonModal
        isOpen={isOpen}
        onRequestClose={onClose}
        contentLabel="Swap"
        buttons={this.renderButtons()}
      >
        <div>
        
          <div className="d-flex">
            <button 
              onClick={() => this.onRateTypeChanged(false)} 
              className={`btn ${!fixedRate? 'btn-success' : 'btn-link'}`}
            >
              Floating rate
            </button>
            {
              fixedRatePossible &&
                <button 
                  onClick={() => this.onRateTypeChanged(true)} 
                  className={`btn ${fixedRate? 'btn-success' : 'btn-link'}`}
                >
                  Fixed rate
                </button>
            }
          </div>
          <form>
            <div className="form-group">
              <Field 
                readOnly={from.loading}
                placeholder={from.loading? '...' : 'YOU SEND'}
                name={fields.from} 
                parse={parse(from.decimals)}
                format={(v) => v && v.replace(',', '.')}
                component={NumericInput} 
                onChange={(e, v) => this.onValueChanged(v, fields.to)}
                suffix={<div className="p-2 pr-3">{initCurrencyFrom}</div>}
              />
            </div>
            
            {
              <div className={`${fixedRate? 'text-success' : ''}`}>
                <small>1 {initCurrencyFrom.toUpperCase()} {fixedRate? '=' : '~'} {(rate && !loading)? parseFloat(rate).toFixed(4) : '...'} {currencyTo.toUpperCase()}</small>
              </div>
            }

            <div className="form-group">
              <Field 
                readOnly={to.loading || !fixedRatePossible}
                placeholder={to.loading? '...' : 'YOU RECEIVE'}
                name={fields.to} 
                parse={parse(to.decimals)}
                component={NumericInput}
                onChange={(e, v) => this.setState({ fixedRate: true }, () => 
                    this.onValueChanged(v, fields.from)
                  )
                }
                suffix={this.renderCurrencyOption(fields.currencyTo, loading)}
              />
            </div>
          </form>
          <div>
            <Field 
              name={fields.from} 
              component={this.renderError} 
              validate={[ rules.required, this.notmoreThanBalance ]}
            />
          </div>
          {errors}
        </div>
        <small style="opacity: 0.6;">By clicking "Swap request" I agree with Changelly's&nbsp;<a href="https://changelly.com/terms-of-use" target="_blank">Terms</a>&nbsp;and&nbsp;<a href="https://changelly.com/aml-kyc" target="_blank">AML/KYC.</a></small>

      </CommonModal>
    )
  }
}
