/**
 * Fixed MLP feedforward neural network with LeakyReLU hidden activations and Tanh output activations.
 */
export class NeuralNetwork {
    /**
     * @param {number} inputSize - Number of input neurons
     * @param {number} hiddenSize - Number of hidden neurons
     * @param {number} outputSize - Number of output neurons
     */
    constructor(inputSize, hiddenSize, outputSize) {
        this.inputSize = inputSize;
        this.hiddenSize = hiddenSize;
        this.outputSize = outputSize;

        this.weightsIH = this._randomMatrix(hiddenSize, inputSize);
        this.biasH = this._randomVector(hiddenSize);
        this.weightsHO = this._randomMatrix(outputSize, hiddenSize);
        this.biasO = this._randomVector(outputSize);
    }

    /**
     * Creates a matrix of random weights using Xavier-like uniform scaling.
     * @private
     */
    _randomMatrix(rows, cols) {
        const mat = [];
        const scale = cols > 0 ? Math.sqrt(2 / cols) : 0.5;
        for (let r = 0; r < rows; r++) {
            const row = [];
            for (let c = 0; c < cols; c++) {
                row.push((Math.random() * 2 - 1) * scale);
            }
            mat.push(row);
        }
        return mat;
    }

    /**
     * Creates a vector of small random biases.
     * @private
     */
    _randomVector(size) {
        const vec = [];
        for (let i = 0; i < size; i++) {
            vec.push((Math.random() * 2 - 1) * 0.1);
        }
        return vec;
    }

    /**
     * Hyperbolic tangent activation function [-1, 1].
     * @private
     */
    _tanh(x) {
        return Math.tanh(x);
    }

    /**
     * Leaky ReLU activation function.
     * @private
     */
    _leakyRelu(x) {
        return x > 0 ? x : x * 0.1;
    }

    /**
     * Performs feedforward propagation through the network.
     * @param {number[]} inputs - Sensory inputs
     * @returns {number[]} Output actions in range [-1, 1]
     */
    predict(inputs) {
        // Hidden layer
        const hidden = new Array(this.hiddenSize);
        for (let i = 0; i < this.hiddenSize; i++) {
            let sum = this.biasH[i];
            for (let j = 0; j < this.inputSize; j++) {
                sum += this.weightsIH[i][j] * (inputs[j] !== undefined ? inputs[j] : 0);
            }
            hidden[i] = this._leakyRelu(sum);
        }

        // Output layer
        const outputs = new Array(this.outputSize);
        for (let i = 0; i < this.outputSize; i++) {
            let sum = this.biasO[i];
            for (let j = 0; j < this.hiddenSize; j++) {
                sum += this.weightsHO[i][j] * hidden[j];
            }
            outputs[i] = this._tanh(sum);
        }

        return outputs;
    }

    /**
     * Randomly mutates weights and biases.
     * @param {number} rate - Probability of mutation per parameter (0..1)
     * @param {number} amount - Maximum perturbation magnitude
     */
    mutate(rate = 0.8, amount = 0.2) {
        const mutateVal = (v) => {
            if (Math.random() < rate) {
                const u = Math.random() * 2 - 1;
                return v + u * amount;
            }
            return v;
        };

        this.weightsIH = this.weightsIH.map(row => row.map(mutateVal));
        this.biasH = this.biasH.map(mutateVal);
        this.weightsHO = this.weightsHO.map(row => row.map(mutateVal));
        this.biasO = this.biasO.map(mutateVal);
    }

    /**
     * Deep clones the network.
     * @returns {NeuralNetwork}
     */
    clone() {
        const copy = new NeuralNetwork(this.inputSize, this.hiddenSize, this.outputSize);
        copy.weightsIH = this.weightsIH.map(r => [...r]);
        copy.biasH = [...this.biasH];
        copy.weightsHO = this.weightsHO.map(r => [...r]);
        copy.biasO = [...this.biasO];
        return copy;
    }

    /**
     * Serializes network configuration and weights to a plain object.
     * @returns {object}
     */
    toJSON() {
        return {
            type: 'MLP',
            inputSize: this.inputSize,
            hiddenSize: this.hiddenSize,
            outputSize: this.outputSize,
            weightsIH: this.weightsIH.map(r => [...r]),
            biasH: [...this.biasH],
            weightsHO: this.weightsHO.map(r => [...r]),
            biasO: [...this.biasO]
        };
    }

    /**
     * Deserializes a network from a JSON-compatible object.
     * @param {object} data
     * @returns {NeuralNetwork}
     */
    static fromJSON(data) {
        const nn = new NeuralNetwork(data.inputSize, data.hiddenSize, data.outputSize);
        nn.weightsIH = data.weightsIH.map(r => [...r]);
        nn.biasH = [...data.biasH];
        nn.weightsHO = data.weightsHO.map(r => [...r]);
        nn.biasO = [...data.biasO];
        return nn;
    }
}
