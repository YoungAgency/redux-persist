// eslint-disable-next-line @typescript-eslint/no-unused-vars
import React from 'react';
export class PersistGate extends React.PureComponent {
    constructor() {
        super(...arguments);
        this.state = {
            bootstrapped: false,
        };
        this.handlePersistorState = () => {
            const { persistor } = this.props;
            const { bootstrapped } = persistor.getState();
            if (bootstrapped) {
                if (this.props.onBeforeLift) {
                    Promise.resolve(this.props.onBeforeLift())
                        .finally(() => this.setState({ bootstrapped: true }));
                }
                else {
                    this.setState({ bootstrapped: true });
                }
                this._unsubscribe && this._unsubscribe();
            }
        };
    }
    componentDidMount() {
        this._unsubscribe = this.props.persistor.subscribe(this.handlePersistorState);
        this.handlePersistorState();
    }
    componentWillUnmount() {
        this._unsubscribe && this._unsubscribe();
    }
    render() {
        if (process.env.NODE_ENV !== 'production') {
            if (typeof this.props.children === 'function' && this.props.loading)
                console.error('redux-persist: PersistGate expects either a function child or loading prop, but not both. The loading prop will be ignored.');
        }
        if (typeof this.props.children === 'function') {
            return this.props.children(this.state.bootstrapped);
        }
        return this.state.bootstrapped ? this.props.children : this.props.loading;
    }
}
PersistGate.defaultProps = {
    children: null,
    loading: null,
};
